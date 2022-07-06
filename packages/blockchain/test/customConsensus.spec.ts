import { Block, BlockHeader } from '@ethereumjs/block'
import * as tape from 'tape'
import { Blockchain, Consensus, EthashConsensus } from '../src'
import { Common, Hardfork } from '@ethereumjs/common'

class fibonacciConsensus implements Consensus {
  algorithm: string
  constructor() {
    this.algorithm = 'fibonacciConsensus'
  }
  genesisInit(_genesisBlock: Block): Promise<void> {
    return new Promise<void>((resolve) => resolve())
  }
  setup(): Promise<void> {
    return new Promise<void>((resolve) => resolve())
  }
  validateConsensus(_block: Block): Promise<void> {
    if (_block.header.extraData.toString('hex') !== '12358d') {
      throw new Error(
        'header contains invalid extradata - must match first 6 elements of fibonacci sequence'
      )
    }
    return new Promise<void>((resolve) => resolve())
  }
  validateDifficulty(_header: BlockHeader): Promise<void> {
    if (_header.number === 1n && _header.difficulty === 1n) {
      return new Promise<void>((resolve) => resolve())
    }
    if (_header.difficulty != _header.number - 1n + _header.number - 2n) {
      throw new Error('invalid difficulty - must be sum of previous two block numbers')
    }
    return new Promise<void>((resolve) => resolve())
  }
  newBlock(): Promise<void> {
    return new Promise<void>((resolve) => resolve())
  }
}

tape('Optional consensus parameter in blockchain constructor', async (t) => {
  t.plan(1)
  const common = new Common({ chain: 'mainnet', hardfork: Hardfork.Chainstart })
  const consensus = new fibonacciConsensus()
  try {
    const blockchain = await Blockchain.create({ common, consensus })
    t.equals(
      (blockchain.consensus as fibonacciConsensus).algorithm,
      'fibonacciConsensus',
      'consensus algorithm matches'
    )
  } catch (err) {
    t.fail('blockchain should instantiate successfully')
  }
})

tape('Custom consensus validation rules', async (t) => {
  t.plan(3)
  const common = new Common({ chain: 'mainnet', hardfork: Hardfork.Chainstart })
  const consensus = new fibonacciConsensus()
  const blockchain = await Blockchain.create({ common, consensus })
  const block = Block.fromBlockData(
    {
      header: {
        number: 1n,
        difficulty: 1n,
        extraData: '0x12358d',
        parentHash: blockchain.genesisBlock.hash(),
        timestamp: blockchain.genesisBlock.header.timestamp + 1n,
        gasLimit: blockchain.genesisBlock.header.gasLimit + 1n,
      },
    },
    { common }
  )

  try {
    await blockchain.putBlock(block)
    t.pass('put block with valid difficulty and extraData')
  } catch {
    t.fail('should have put block with valid difficulty and extraData')
  }

  const blockWithBadDifficulty = Block.fromBlockData(
    {
      header: {
        number: 2n,
        difficulty: 2n,
        extraData: '0x12358d',
        parentHash: block.hash(),
        timestamp: block.header.timestamp + 1n,
      },
    },
    { common }
  )
  try {
    await blockchain.putBlock(blockWithBadDifficulty)
    t.fail('should throw')
  } catch (err: any) {
    t.ok(err.message.includes('invalid difficulty'), 'failed to put block with invalid difficulty')
  }

  const blockWithBadExtraData = Block.fromBlockData(
    {
      header: {
        number: 2n,
        difficulty: 1n,
        extraData: '0x12358c',
        parentHash: block.hash(),
        timestamp: block.header.timestamp + 1n,
        gasLimit: block.header.gasLimit + 1n,
      },
    },
    { common }
  )
  try {
    await blockchain.putBlock(blockWithBadExtraData)
    t.fail('should throw')
  } catch (err: any) {
    t.ok(
      err.message ===
        'header contains invalid extradata - must match first 6 elements of fibonacci sequence',
      'failed to put block with invalid extraData'
    )
  }
})

tape('consensus transition checks', async (t) => {
  t.plan(2)
  const common = new Common({ chain: 'mainnet', hardfork: Hardfork.Chainstart })
  const consensus = new fibonacciConsensus()
  const blockchain = await Blockchain.create({ common, consensus })

  t.doesNotThrow(
    () => (blockchain as any).checkAndTransitionHardForkByNumber(5),
    'checkAndTransitionHardForkByNumber should not throw with custom consensus'
  )
  ;(blockchain as any).consensus = new EthashConsensus()
  ;(blockchain._common as any).consensusAlgorithm = () => 'fibonacci'
  t.throws(
    () => (blockchain as any).checkAndTransitionHardForkByNumber(5),
    'checkAndTransitionHardForkByNumber should throw when using standard consensus (ethash, clique, casper) but consensus algorithm defined in common is different'
  )
})
