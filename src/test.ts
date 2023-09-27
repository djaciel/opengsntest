import { RelayProvider } from '@opengsn/provider'
import { ethers } from 'ethers'
import { describe, expect, it } from 'vitest'

const captureTheFlagFunctionAbiEntry = {
  inputs: [],
  name: 'captureTheFlag',
  outputs: [],
  stateMutability: 'nonpayable',
  type: 'function',
}

const erc20ABI = [
  {
    constant: true,
    inputs: [],
    name: 'name',
    outputs: [
      {
        name: '',
        type: 'string',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_spender',
        type: 'address',
      },
      {
        name: '_value',
        type: 'uint256',
      },
    ],
    name: 'approve',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'totalSupply',
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_from',
        type: 'address',
      },
      {
        name: '_to',
        type: 'address',
      },
      {
        name: '_value',
        type: 'uint256',
      },
    ],
    name: 'transferFrom',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [
      {
        name: '',
        type: 'uint8',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: '_owner',
        type: 'address',
      },
    ],
    name: 'balanceOf',
    outputs: [
      {
        name: 'balance',
        type: 'uint256',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [
      {
        name: '',
        type: 'string',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_to',
        type: 'address',
      },
      {
        name: '_value',
        type: 'uint256',
      },
    ],
    name: 'transfer',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: '_owner',
        type: 'address',
      },
      {
        name: '_spender',
        type: 'address',
      },
    ],
    name: 'allowance',
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    payable: true,
    stateMutability: 'payable',
    type: 'fallback',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'owner',
        type: 'address',
      },
      {
        indexed: true,
        name: 'spender',
        type: 'address',
      },
      {
        indexed: false,
        name: 'value',
        type: 'uint256',
      },
    ],
    name: 'Approval',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'from',
        type: 'address',
      },
      {
        indexed: true,
        name: 'to',
        type: 'address',
      },
      {
        indexed: false,
        name: 'value',
        type: 'uint256',
      },
    ],
    name: 'Transfer',
    type: 'event',
  },
]

describe('test', () => {
  it('should be ok', async () => {
    const PAYMASTER_ADDRESS = '0xAeC69BdA4F4fb4Ef355c35e6d48B76Acd05Ee554'
    const CAPTURE_THE_FLAG_ADDRESS = '0x18dedf259D11934DCe7218E54F19E4c653264867'
    const NEXERA_TOKEN_ADDRESS = '0x57F0A442216af7b2480a94E9E7E7af2A4217c271'

    const TEST_MNEMONIC = ''
    const wallet = ethers.Wallet.fromMnemonic(TEST_MNEMONIC)

    const mumbaiProvider = new ethers.providers.JsonRpcProvider(
      'https://rpc-mumbai.maticvigil.com',
      80001
    )

    const signer = wallet.connect(mumbaiProvider)

    const signerGsn = ethers.Wallet.createRandom().connect(mumbaiProvider)

    const gsn = await RelayProvider.newEthersV5Provider({
      provider: signer,
      config: {
        loggerConfiguration: {
          logLevel: 'error',
        },
        paymasterAddress: PAYMASTER_ADDRESS,
      },
    })

    gsn.gsnProvider.sendTransaction

    const nxraToken = new ethers.Contract(NEXERA_TOKEN_ADDRESS, erc20ABI, signer)

    console.log('************* nxra allowance', (await nxraToken.allowance(signer.address,PAYMASTER_ADDRESS)).toString())

    const captureTheFlag = new ethers.Contract(
      CAPTURE_THE_FLAG_ADDRESS,
      [captureTheFlagFunctionAbiEntry]
    )

    const metaTx = await captureTheFlag.populateTransaction.captureTheFlag()

    if (!metaTx.data) {
      return
    }

    console.log('************* metaTx', JSON.stringify(metaTx))

    const signedTx = await signer.signTransaction(metaTx)

    const tx = await gsn.gsnSigner.sendTransaction(metaTx)

    // const tx = await gsn.relayProvider.relayClient.relayTransaction({
    //     data: metaTx.data,
    //     from: signer.address,
    //     to: CAPTURE_THE_FLAG_ADDRESS,
    //     maxFeePerGas: '100',
    //     maxPriorityFeePerGas: '100',
    // })

    // const tx = await gsn.gsnProvider.sendTransaction(signedTx)
    const receipt = await tx.wait()

    console.log('************* receipt', JSON.stringify(receipt))

    console.log('signer address', signer.address)
  })
})
