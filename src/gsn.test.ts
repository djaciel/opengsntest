import { JsonRpcSigner } from '@ethersproject/providers'
import {
  AccountManager,
  ContractInteractor,
  GSNConfig,
  GsnTransactionDetails,
  JsonRpcPayload,
  JsonRpcResponse,
  PingResponse,
  RelayInfo,
  RelayProvider,
  RelayRequest,
  RelaySelectionManager,
} from '@opengsn/provider'
import { PrefixedHexString } from 'ethereumjs-util'
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
  }
]

// create a custom account manager to override the sign method
class CustomAccountManager extends AccountManager {
  // we store the signature in this variable
  private signature: PrefixedHexString

  constructor(signer: JsonRpcSigner, chainId: number, config: GSNConfig) {
    super(signer, chainId, config)
    this.signature = ethers.constants.HashZero
  }

  // in the server-side, we set the signature with the signature received from the client
  setSignature(signature: PrefixedHexString) {
    this.signature = signature
  }

  // override the sign method to return the signature
  async sign(domainSeparatorName: string, relayRequest: RelayRequest): Promise<PrefixedHexString> {
    return this.signature
  }
}

describe('GSN Relayer test', () => {
  it('should be ok', async () => {
    const PAYMASTER_ADDRESS = '0xAeC69BdA4F4fb4Ef355c35e6d48B76Acd05Ee554'
    const CAPTURE_THE_FLAG_ADDRESS = '0x18dedf259D11934DCe7218E54F19E4c653264867'
    const NEXERA_TOKEN_ADDRESS = '0x57F0A442216af7b2480a94E9E7E7af2A4217c271'

    // nexera dev relay server for mumbai testnet
    // more relay urls are needed for each chain
    // this data could exist on the nexera registry
    const RELAYER_URL = 'https://relay-server-mumbai-dev.nexera.id/'

    const mumbaiProvider = new ethers.providers.JsonRpcProvider(
      'https://rpc-mumbai.maticvigil.com',
      80001
    )

    // user account that has NXRA token
    const TEST_MNEMONIC =
      ''

    // user signer that has NXRA token and will sign the transaction
    const user_signer = ethers.Wallet.fromMnemonic(TEST_MNEMONIC).connect(mumbaiProvider)

    // api signer that will send the user signed transaction to the relayer
    // its random because we don't need any funds
    const api_signer = ethers.Wallet.createRandom().connect(mumbaiProvider)

    // user GSN provider used just to sign the transaction using the gsn stuff
    // this provider would be returned by the Web3UserV1
    const user_GSN = await RelayProvider.newEthersV5Provider({
      provider: user_signer,
      config: {
        loggerConfiguration: {
          logLevel: 'error',
        },
        preferredRelays: [RELAYER_URL],
        paymasterAddress: PAYMASTER_ADDRESS,
      },
    })

    // api GSN provider temporal used just to get stuff from the gsn
    const api_GSN_temp = await RelayProvider.newEthersV5Provider({
      provider: api_signer,
      config: {
        loggerConfiguration: {
          logLevel: 'error',
        },
        preferredRelays: [RELAYER_URL],
        paymasterAddress: PAYMASTER_ADDRESS,
      },
    })

    // api GSN provider used to send the user signed transaction to the relayer
    // we override the accountManager to use our custom account manager
    // in order to initialize the accountManager, we need to pass some parameters from the api_GSN_temp
    const api_GSN = await RelayProvider.newEthersV5Provider({
      provider: api_signer,
      config: {
        loggerConfiguration: {
          logLevel: 'error',
        },
        preferredRelays: [RELAYER_URL],
        paymasterAddress: PAYMASTER_ADDRESS,
      },
      overrideDependencies: {
        accountManager: new CustomAccountManager(
          api_GSN_temp.relayProvider.relayClient.wrappedUnderlyingSigner,
          80001,
          api_GSN_temp.relayProvider.relayClient.config
        ),
      },
    })
    
    const nxraTokenContract = new ethers.Contract(NEXERA_TOKEN_ADDRESS, erc20ABI, mumbaiProvider)

    // get all balances before executing the transaction
    const userNxraBalanceBefore = await nxraTokenContract.balanceOf(user_signer.address)
    const apiNxraBalanceBefore = await nxraTokenContract.balanceOf(api_signer.address)
    const userEthBalanceBefore = await user_signer.getBalance()
    const apiEthBalanceBefore = await api_signer.getBalance()

    // ensure the paymaster has allowance to spend the user NXRA token
    console.log(
      '************* nxra allowance',
      (await nxraTokenContract.allowance(user_signer.address, PAYMASTER_ADDRESS)).toString()
    )

    const captureTheFlagContract = new ethers.Contract(
      CAPTURE_THE_FLAG_ADDRESS,
      [captureTheFlagFunctionAbiEntry],
      mumbaiProvider
    )

    const { maxFeePerGas, maxPriorityFeePerGas } = await api_GSN.relayProvider.calculateGasFees()

    // create the gsn transaction details
    const _gsnTransactionDetails: GsnTransactionDetails = {
      data: captureTheFlagContract.interface.encodeFunctionData('captureTheFlag'),
      from: user_signer.address,
      to: CAPTURE_THE_FLAG_ADDRESS,
      maxFeePerGas,
      maxPriorityFeePerGas,
      paymasterData: PAYMASTER_ADDRESS,
      useGSN: true,
      gas: (await captureTheFlagContract.estimateGas.captureTheFlag()).toHexString(),
    }

    const gsnTransactionDetails = { ..._gsnTransactionDetails }

    // get the relay request using the api_GSN provider
    // this relay request must be provided to the user to sign it through the api
    const relayRequest = await api_GSN.relayProvider.relayClient._prepareRelayRequest(
      gsnTransactionDetails
    )

    // set the relay worker to the one that we want to use
    // this address belongs to the RELAYER_URL
    relayRequest.relayData.relayWorker = '0x58a4ee5eb91b32d8d525355590cb7dc6c6d978db'
    relayRequest.relayData.transactionCalldataGasUsed =
      await api_GSN.relayProvider.relayClient.dependencies.contractInteractor.estimateCalldataCostForRequest(
        relayRequest,
        {
          maxApprovalDataLength: api_GSN.relayProvider.relayClient.config.maxApprovalDataLength,
          maxPaymasterDataLength: api_GSN.relayProvider.relayClient.config.maxPaymasterDataLength,
        }
      )

    console.log('************* relayRequest', JSON.stringify(relayRequest))

    // sign the relay request using the user_GSN provider
    // this must be done in the client-side
    const signature = await user_GSN.relayProvider.relayClient.dependencies.accountManager.sign(
      user_GSN.relayProvider.relayClient.config.domainSeparatorName,
      relayRequest
    )

    console.log('************* signature', JSON.stringify(signature))

    // the signature must be sent to the api
    // in the server-side, we set the signature in the api_GSN provider accountManager
    api_GSN.relayProvider.relayClient.dependencies.accountManager.setSignature(signature)

    console.log(
      '************* api_GSN.relayProvider.relayClient.dependencies.accountManager',
      JSON.stringify(api_GSN.relayProvider.relayClient.dependencies.accountManager)
    )

    // wait few seconds to simulate the user sending the signed transaction to the api
		let i = 0
		while (i < 20) {
			console.log('************* waiting', i)
			await new Promise(resolve => setTimeout(resolve, 1000))
			i++
		}

    const gasAndDataLimits =
      await api_GSN.relayProvider.relayClient.dependencies.contractInteractor.getGasAndDataLimitsFromPaymaster(
        relayRequest.relayData.paymaster
      )

    // run the dry run to verify if the transaction will be successful
    const { error: dryRunError, viewCallGasLimit } =
      await api_GSN.relayProvider.relayClient._verifyDryRunSuccessful(
        relayRequest,
        gasAndDataLimits
      )
    if (dryRunError != null) {
      expect(dryRunError).toBeNull()
    }

    // run the relaying transaction
    // we are hardcoding the pingResponse and relayInfo
    // we need to figure out how to get this data from the api_GSN provider
    const relayingAttempt = await api_GSN.relayProvider.relayClient._attemptRelay(
      {
        pingResponse: {
          relayWorkerAddress: '0x58a4ee5eb91b32d8d525355590cb7dc6c6d978db',
          relayManagerAddress: '0x4232f78050f6b6005fb658fde988a19997da87ee',
          relayHubAddress: '0x3232f21A6E08312654270c78A773f00dd61d60f5',
          ownerAddress: '0x1782aaD1AD8ce3174d8E5B22309D301A2d20A6f2',
          minMaxPriorityFeePerGas: '2010000002',
          maxMaxFeePerGas: '500000000000',
          minMaxFeePerGas: '15',
          maxAcceptanceBudget: '285252',
          chainId: '80001',
          networkId: '80001',
          ready: true,
          version: '3.0.0-beta.3',
        },
        relayInfo: {
          lastSeenBlockNumber: 40319233,
          lastSeenTimestamp: 1695222830,
          firstSeenBlockNumber: 40319233,
          firstSeenTimestamp: 1695222830,
          relayManager: '0x4232f78050f6b6005fb658FDE988a19997dA87Ee',
          relayUrl: 'https://relay-server-mumbai-dev.nexera.id/',
        },
      },
      relayRequest,
      viewCallGasLimit
    )

    console.log('************* relayingAttempt', JSON.stringify(relayingAttempt))
		console.log('************* transactionHash', relayingAttempt.transaction?.hash)

    expect(relayingAttempt.transaction?.hash).not.toBeNull()
    const receipt = await mumbaiProvider.waitForTransaction(
      relayingAttempt.transaction?.hash as string
    )
    console.log('************* receipt', JSON.stringify(receipt))

    const userNxraBalanceAfter = await nxraTokenContract.balanceOf(user_signer.address)
    const apiNxraBalanceAfter = await nxraTokenContract.balanceOf(api_signer.address)
    const userEthBalanceAfter = await user_signer.getBalance()
    const apiEthBalanceAfter = await api_signer.getBalance()

    console.log('************* user balances *************')
    console.log('************* user NXRA balance before', userNxraBalanceBefore.toString())
    console.log('************* user NXRA balance after', userNxraBalanceAfter.toString())
    console.log('************* user NXRA balance difference', userNxraBalanceBefore.sub(userNxraBalanceAfter).toString())
    console.log('************* user ETH balance before', userEthBalanceBefore.toString())
    console.log('************* user ETH balance after', userEthBalanceAfter.toString())
    console.log('************* user ETH balance difference', userEthBalanceBefore.sub(userEthBalanceAfter).toString())

    console.log('************* api balances *************')
    console.log('************* api NXRA balance before', apiNxraBalanceBefore.toString())
    console.log('************* api NXRA balance after', apiNxraBalanceAfter.toString())
    console.log('************* api NXRA balance difference', apiNxraBalanceAfter.sub(apiNxraBalanceBefore).toString())
    console.log('************* api ETH balance before', apiEthBalanceBefore.toString())
    console.log('************* api ETH balance after', apiEthBalanceAfter.toString())
    console.log('************* api ETH balance difference', apiEthBalanceAfter.sub(apiEthBalanceBefore).toString())

  })
})
