import * as tape from 'tape'
import { Chain, Common, Hardfork } from '@ethereumjs/common'
import { BlockHeader } from '../src/header'
import { Block } from '../src/block'
import { FeeMarketEIP1559Transaction } from '@ethereumjs/tx'

// Test data from Besu (retrieved via Discord)
// Older version at https://github.com/abdelhamidbakhta/besu/blob/bf54b6c0b40d3015fc85ff9b078fbc26592d80c0/ethereum/core/src/test/resources/org/hyperledger/besu/ethereum/core/fees/basefee-test.json
const eip1559BaseFee = require('./testdata/eip1559baseFee.json')

const common = new Common({
  eips: [1559],
  chain: Chain.Mainnet,
  hardfork: Hardfork.London,
})

const genesis = Block.fromBlockData({})

// Small hack to hack in the activation block number
// (Otherwise there would be need for a custom chain only for testing purposes)
common.hardforkBlock = function (hardfork: string | undefined) {
  if (hardfork === 'london') {
    return BigInt(1)
  } else if (hardfork === 'dao') {
    // Avoid DAO HF side-effects
    return BigInt(99)
  }
  return BigInt(0)
}

tape('EIP1559 tests', function (t) {
  t.test('Header -> Initialization', function (st) {
    const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Istanbul })
    st.throws(() => {
      BlockHeader.fromHeaderData(
        {
          number: BigInt(1),
          parentHash: genesis.hash(),
          timestamp: BigInt(1),
          gasLimit: genesis.header.gasLimit * BigInt(2), // Special case on EIP-1559 transition block
          baseFeePerGas: BigInt(5),
        },
        {
          common,
        }
      )
    }, 'should throw when setting baseFeePerGas with EIP1559 not being activated')
    st.end()
  })

  t.test('Header -> genericFormatValidation checks', async function (st) {
    try {
      BlockHeader.fromHeaderData(
        {
          number: BigInt(1),
          parentHash: genesis.hash(),
          gasLimit: genesis.header.gasLimit * BigInt(2), // Special case on EIP-1559 transition block
          timestamp: BigInt(1),
          baseFeePerGas: 100,
        },
        {
          calcDifficultyFromHeader: genesis.header,
          common,
          freeze: false,
        }
      )
      st.fail('should throw when baseFeePerGas is not set to initial base fee')
    } catch (e: any) {
      const expectedError = 'Initial EIP1559 block does not have initial base fee'
      st.ok(
        e.message.includes(expectedError),
        'should throw if base fee is not set to initial value'
      )
    }

    try {
      const header = BlockHeader.fromHeaderData(
        {
          number: BigInt(1),
          parentHash: genesis.hash(),
          gasLimit: genesis.header.gasLimit * BigInt(2), // Special case on EIP-1559 transition block
          timestamp: BigInt(1),
        },
        {
          calcDifficultyFromHeader: genesis.header,
          common,
          freeze: false,
        }
      )
      ;(header as any).baseFeePerGas = undefined
      await (header as any)._genericFormatValidation()
    } catch (e: any) {
      const expectedError = 'EIP1559 block has no base fee field'
      st.ok(
        e.message.includes(expectedError),
        'should throw with no base fee field when EIP1559 is activated'
      )
    }

    st.end()
  })

  t.test('Header -> _genericFormValidation -> success case', async function (st) {
    Block.fromBlockData(
      {
        header: {
          number: BigInt(1),
          parentHash: genesis.hash(),
          gasLimit: genesis.header.gasLimit * BigInt(2), // Special case on EIP-1559 transition block
          timestamp: BigInt(1),
          baseFeePerGas: common.param('gasConfig', 'initialBaseFee'),
        },
      },
      {
        calcDifficultyFromHeader: genesis.header,
        common,
      }
    )

    st.pass('Valid initial EIP1559 header should be valid')

    st.end()
  })

  t.test('Header -> validate()', async function (st) {
    try {
      BlockHeader.fromHeaderData(
        {
          baseFeePerGas: BigInt(1000),
          number: BigInt(1),
          parentHash: genesis.hash(),
          gasLimit: genesis.header.gasLimit * BigInt(2), // Special case on EIP-1559 transition block
          timestamp: BigInt(1),
        },
        {
          calcDifficultyFromHeader: genesis.header,
          common,
        }
      )
      st.fail('should throw')
    } catch (e: any) {
      st.ok(e.message.includes('base fee'), 'should throw on wrong initial base fee')
    }
    st.end()
  })

  t.test('Header -> validate() -> success cases', async function (st) {
    const block1 = Block.fromBlockData(
      {
        header: {
          number: BigInt(1),
          parentHash: genesis.hash(),
          timestamp: BigInt(1),
          gasLimit: genesis.header.gasLimit * BigInt(2), // Special case on EIP-1559 transition block
          baseFeePerGas: BigInt(1000000000),
        },
      },
      {
        calcDifficultyFromHeader: genesis.header,
        common,
      }
    )
    Block.fromBlockData(
      {
        header: {
          number: BigInt(2),
          parentHash: block1.hash(),
          timestamp: BigInt(2),
          gasLimit: genesis.header.gasLimit * BigInt(2), // Special case on EIP-1559 transition block
          baseFeePerGas: Buffer.from('342770c0', 'hex'),
        },
      },
      {
        calcDifficultyFromHeader: block1.header,
        common,
      }
    )
    st.pass('should correctly validate subsequent EIP-1559 blocks')
    st.end()
  })

  t.test('Header -> validate() -> gas usage', async function (st) {
    try {
      BlockHeader.fromHeaderData(
        {
          number: BigInt(1),
          parentHash: genesis.hash(),
          timestamp: BigInt(1),
          gasLimit: genesis.header.gasLimit * BigInt(2), // Special case on EIP-1559 transition block
          gasUsed:
            genesis.header.gasLimit *
              (common.param('gasConfig', 'elasticityMultiplier') ?? BigInt(0)) +
            BigInt(1),
          baseFeePerGas: common.param('gasConfig', 'initialBaseFee'),
        },
        {
          calcDifficultyFromHeader: genesis.header,
          common,
        }
      )
      st.fail('should throw')
    } catch (e: any) {
      st.ok(e.message.includes('too much gas used'), 'should throw when elasticity is exceeded')
    }
    st.end()
  })

  t.test('Header -> validate() -> gas usage', async function (st) {
    BlockHeader.fromHeaderData(
      {
        number: BigInt(1),
        parentHash: genesis.hash(),
        timestamp: BigInt(1),
        gasLimit: genesis.header.gasLimit * BigInt(2), // Special case on EIP-1559 transition block
        gasUsed: genesis.header.gasLimit * BigInt(2),
        baseFeePerGas: common.param('gasConfig', 'initialBaseFee'),
      },
      {
        calcDifficultyFromHeader: genesis.header,
        common,
      }
    )

    st.pass('should not throw when elasticity is exactly matched')
    st.end()
  })

  const block1 = Block.fromBlockData(
    {
      header: {
        number: BigInt(1),
        parentHash: genesis.hash(),
        gasLimit: genesis.header.gasLimit * BigInt(2), // Special case on EIP-1559 transition block
        timestamp: BigInt(1),
        baseFeePerGas: common.param('gasConfig', 'initialBaseFee'),
      },
    },
    {
      calcDifficultyFromHeader: genesis.header,
      common,
    }
  )

  t.test('Header -> validate() -> gasLimit -> success cases', async function (st) {
    let parentGasLimit = genesis.header.gasLimit * BigInt(2)
    BlockHeader.fromHeaderData(
      {
        number: BigInt(1),
        parentHash: genesis.hash(),
        timestamp: BigInt(1),
        gasLimit: parentGasLimit + parentGasLimit / BigInt(1024) - BigInt(1),
        baseFeePerGas: common.param('gasConfig', 'initialBaseFee'),
      },
      {
        calcDifficultyFromHeader: genesis.header,
        common,
      }
    )

    st.pass('should not throw if gas limit is between bounds (HF transition block)')

    BlockHeader.fromHeaderData(
      {
        number: BigInt(1),
        parentHash: genesis.hash(),
        timestamp: BigInt(1),
        gasLimit: parentGasLimit - parentGasLimit / BigInt(1024) + BigInt(1),
        baseFeePerGas: common.param('gasConfig', 'initialBaseFee'),
      },
      {
        calcDifficultyFromHeader: genesis.header,
        common,
      }
    )

    st.pass('should not throw if gas limit is between bounds (HF transition block)')

    parentGasLimit = block1.header.gasLimit
    BlockHeader.fromHeaderData(
      {
        number: BigInt(2),
        parentHash: block1.hash(),
        timestamp: BigInt(2),
        gasLimit: parentGasLimit + parentGasLimit / BigInt(1024) - BigInt(1),
        baseFeePerGas: Buffer.from('342770c0', 'hex'),
      },
      {
        calcDifficultyFromHeader: block1.header,
        common,
      }
    )

    st.pass('should not throw if gas limit is between bounds (post-HF transition block)')

    BlockHeader.fromHeaderData(
      {
        number: BigInt(2),
        parentHash: block1.hash(),
        timestamp: BigInt(2),
        gasLimit: parentGasLimit - parentGasLimit / BigInt(1024) + BigInt(1),
        baseFeePerGas: Buffer.from('342770c0', 'hex'),
      },
      {
        calcDifficultyFromHeader: block1.header,
        common,
      }
    )

    st.pass('should not throw if gas limit is between bounds (post-HF transition block)')
    st.end()
  })

  t.test('Header -> validateGasLimit() -> error cases', async function (st) {
    let parentGasLimit = genesis.header.gasLimit * BigInt(2)
    let header = BlockHeader.fromHeaderData(
      {
        number: BigInt(1),
        parentHash: genesis.hash(),
        timestamp: BigInt(1),
        gasLimit: parentGasLimit + parentGasLimit,
        baseFeePerGas: common.param('gasConfig', 'initialBaseFee'),
      },
      {
        calcDifficultyFromHeader: genesis.header,
        common,
      }
    )
    try {
      header.validateGasLimit(genesis.header)
      st.fail('should throw')
    } catch (e: any) {
      st.ok(
        e.message.includes('gas limit increased too much'),
        'should throw if gas limit is increased too much (HF transition block)'
      )
    }

    parentGasLimit = block1.header.gasLimit
    header = BlockHeader.fromHeaderData(
      {
        number: BigInt(2),
        parentHash: block1.hash(),
        timestamp: BigInt(2),
        gasLimit: parentGasLimit + parentGasLimit / BigInt(1024),
        baseFeePerGas: Buffer.from('342770c0', 'hex'),
      },
      {
        calcDifficultyFromHeader: block1.header,
        common,
      }
    )
    try {
      header.validateGasLimit(block1.header)
      st.fail('should throw')
    } catch (e: any) {
      st.ok(
        e.message.includes('gas limit increased too much'),
        'should throw if gas limit is increased too much (post-HF transition block)'
      )
    }
    st.end()
  })

  t.test('Header -> validateGasLimit() -> error cases', async function (st) {
    let parentGasLimit = genesis.header.gasLimit * BigInt(2)
    let header = BlockHeader.fromHeaderData(
      {
        number: BigInt(1),
        parentHash: genesis.hash(),
        timestamp: BigInt(1),
        gasLimit: parentGasLimit - parentGasLimit / BigInt(1024),
        baseFeePerGas: common.param('gasConfig', 'initialBaseFee'),
      },
      {
        calcDifficultyFromHeader: genesis.header,
        common,
      }
    )
    try {
      header.validateGasLimit(genesis.header)
      st.fail('should throw')
    } catch (e: any) {
      st.ok(
        e.message.includes('gas limit decreased too much'),
        'should throw if gas limit is decreased too much (HF transition block)'
      )
    }

    parentGasLimit = block1.header.gasLimit
    header = BlockHeader.fromHeaderData(
      {
        number: BigInt(2),
        parentHash: block1.hash(),
        timestamp: BigInt(2),
        gasLimit: parentGasLimit - parentGasLimit / BigInt(1024),
        baseFeePerGas: Buffer.from('342770c0', 'hex'),
      },
      {
        calcDifficultyFromHeader: block1.header,
        common,
      }
    )
    try {
      header.validateGasLimit(block1.header)
      st.fail('should throw')
    } catch (e: any) {
      st.ok(
        e.message.includes('gas limit decreased too much'),
        'should throw if gas limit is decreased too much (post-HF transition block)'
      )
    }
    st.end()
  })

  t.test('Header -> validateTransactions() -> tx', async (st) => {
    const transaction = FeeMarketEIP1559Transaction.fromTxData(
      {
        maxFeePerGas: BigInt(0),
        maxPriorityFeePerGas: BigInt(0),
      },
      { common }
    ).sign(Buffer.from('46'.repeat(32), 'hex'))
    const block = Block.fromBlockData(
      {
        header: {
          number: BigInt(1),
          parentHash: genesis.hash(),
          gasLimit: genesis.header.gasLimit * BigInt(2), // Special case on EIP-1559 transition block
          timestamp: BigInt(1),
          baseFeePerGas: common.param('gasConfig', 'initialBaseFee'),
        },
        transactions: [
          {
            maxFeePerGas: BigInt(0),
            maxPriorityFeePerGas: BigInt(0),
            type: 2,
            v: transaction.v,
            r: transaction.r,
            s: transaction.s,
            gasLimit: 53000,
          },
        ],
      },
      {
        common,
        calcDifficultyFromHeader: genesis.header,
      }
    )

    const errs = block.validateTransactions(true)
    st.ok(
      errs[0].includes('unable to pay base fee'),
      'should throw if transaction is unable to pay base fee'
    )
    st.end()
  })

  t.test('Header -> calcNextBaseFee()', function (st) {
    for (let index = 0; index < eip1559BaseFee.length; index++) {
      const item = eip1559BaseFee[index]
      const result = BlockHeader.fromHeaderData(
        {
          baseFeePerGas: BigInt(item.parentBaseFee),
          gasUsed: BigInt(item.parentGasUsed),
          gasLimit: BigInt(item.parentTargetGasUsed) * BigInt(2),
        },
        { common }
      ).calcNextBaseFee()
      const expected = BigInt(item.expectedBaseFee)
      st.equal(expected, result, 'base fee correct')
    }
    st.end()
  })

  t.test('Header -> toJSON()', function (st) {
    const header = BlockHeader.fromHeaderData(
      {
        number: BigInt(3),
        parentHash: genesis.hash(),
        timestamp: BigInt(1),
        gasLimit: genesis.header.gasLimit,
        baseFeePerGas: BigInt(5),
      },
      {
        common,
      }
    )
    st.equal(header.toJSON().baseFeePerGas, '0x5')
    st.end()
  })
})
