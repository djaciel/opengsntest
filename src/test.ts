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

class CustomAccountManager extends AccountManager {
  private signature: PrefixedHexString

  constructor(signer: JsonRpcSigner, chainId: number, config: GSNConfig) {
    super(signer, chainId, config)
    this.signature = ethers.constants.HashZero
  }

  setSignature(signature: PrefixedHexString) {
    this.signature = signature
  }

  async sign(domainSeparatorName: string, relayRequest: RelayRequest): Promise<PrefixedHexString> {
    return this.signature
  }
}

// class CustomJsonRpcProvider extends ethers.providers.JsonRpcProvider {
//   private signature: string;

//   constructor(url: string) {
//     super(url);
//     this.signature = ethers.constants.HashZero;
//   }

//   async _signTypedData(domain: any, types: any, message: any) {
//     return this.signature;
//   }

//   // async getSigner(addressOrIndex?: string | number | undefined): ethers.providers.JsonRpcSigner {
//   //   const walletRandom = ethers.Wallet.createRandom();
//   //   const wallet = walletRandom.connect(this);
//   //   return
//   // }

//   setSignature(signature: string) {
//     this.signature = signature;
//   }
// }

// const customProvider = new CustomJsonRpcProvider('https://rpc-mumbai.maticvigil.com');

describe('test', () => {
  it('should be ok', async () => {
    const PAYMASTER_ADDRESS = '0xAeC69BdA4F4fb4Ef355c35e6d48B76Acd05Ee554'
    const CAPTURE_THE_FLAG_ADDRESS = '0x18dedf259D11934DCe7218E54F19E4c653264867'
    const NEXERA_TOKEN_ADDRESS = '0x57F0A442216af7b2480a94E9E7E7af2A4217c271'

    const TEST_MNEMONIC =
      ''
    const wallet = ethers.Wallet.fromMnemonic(TEST_MNEMONIC)

    const mumbaiProvider = new ethers.providers.JsonRpcProvider(
      'https://rpc-mumbai.maticvigil.com',
      80001
    )

    const user_signer = wallet.connect(mumbaiProvider)
    const api_signer = ethers.Wallet.createRandom().connect(mumbaiProvider)

    const user_GSN = await RelayProvider.newEthersV5Provider({
      provider: user_signer,
      config: {
        loggerConfiguration: {
          logLevel: 'error',
        },
        preferredRelays: ['https://relay-server-mumbai-dev.nexera.id/'],
        paymasterAddress: PAYMASTER_ADDRESS,
        requestValidSeconds: 60 * 60 * 24,
      },
    })

    const api_GSN_temp = await RelayProvider.newEthersV5Provider({
      provider: api_signer,
      config: {
        loggerConfiguration: {
          logLevel: 'error',
        },
        preferredRelays: ['https://relay-server-mumbai-dev.nexera.id/'],
        paymasterAddress: PAYMASTER_ADDRESS,
        requestValidSeconds: 60 * 60 * 24,
      },
    })

    const api_GSN = await RelayProvider.newEthersV5Provider({
      provider: api_signer,
      config: {
        loggerConfiguration: {
          logLevel: 'error',
        },
        preferredRelays: ['https://relay-server-mumbai-dev.nexera.id/'],
        paymasterAddress: PAYMASTER_ADDRESS,
        requestValidSeconds: 60 * 60 * 24,
      },
      overrideDependencies: {
        accountManager: new CustomAccountManager(
          api_GSN_temp.relayProvider.relayClient.wrappedUnderlyingSigner,
          80001,
          api_GSN_temp.relayProvider.relayClient.config
        ),
      },
    })

    // const relayProvider = await RelayProvider.newWeb3Provider({
    //   provider: mumbaiProvider,
    //   config: {
    //     loggerConfiguration: {
    //       logLevel: 'error',
    //     },
    //     paymasterAddress: PAYMASTER_ADDRESS,
    //   },
    // })

    const nxraToken = new ethers.Contract(NEXERA_TOKEN_ADDRESS, erc20ABI, user_signer)
    const balanceBefore = await nxraToken.balanceOf(user_signer.address)
    console.log(
      '************* nxra allowance',
      (await nxraToken.allowance(user_signer.address, PAYMASTER_ADDRESS)).toString()
    )

    const captureTheFlag = new ethers.Contract(
      CAPTURE_THE_FLAG_ADDRESS,
      [captureTheFlagFunctionAbiEntry],
      mumbaiProvider
    )

    const metaTx = await captureTheFlag.populateTransaction.captureTheFlag()

    if (!metaTx.data) {
      return
    }

    console.log('************* metaTx', JSON.stringify(metaTx))

    const { maxFeePerGas, maxPriorityFeePerGas } = await api_GSN.relayProvider.calculateGasFees()

    const _gsnTransactionDetails: GsnTransactionDetails = {
      data: captureTheFlag.interface.encodeFunctionData('captureTheFlag'),
      from: user_signer.address,
      to: CAPTURE_THE_FLAG_ADDRESS,
      maxFeePerGas,
      maxPriorityFeePerGas,
      paymasterData: PAYMASTER_ADDRESS,
      useGSN: true,
      gas: (await captureTheFlag.estimateGas.captureTheFlag()).toHexString(),
    }

    const gsnTransactionDetails = { ..._gsnTransactionDetails }

    const relayRequest = await api_GSN.relayProvider.relayClient._prepareRelayRequest(
      gsnTransactionDetails
    )

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

    const signature = await user_GSN.relayProvider.relayClient.dependencies.accountManager.sign(
      user_GSN.relayProvider.relayClient.config.domainSeparatorName,
      relayRequest
    )

    console.log('************* signature', JSON.stringify(signature))

    api_GSN.relayProvider.relayClient.dependencies.accountManager.setSignature(signature)

    console.log(
      '************* api_GSN.relayProvider.relayClient.dependencies.accountManager',
      JSON.stringify(api_GSN.relayProvider.relayClient.dependencies.accountManager)
    )

    // wait seconds
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

    const { error: dryRunError, viewCallGasLimit } =
      await api_GSN.relayProvider.relayClient._verifyDryRunSuccessful(
        relayRequest,
        gasAndDataLimits
      )
    if (dryRunError != null) {
      expect(dryRunError).toBeNull()
    }

    // const relaySelectionManager = await new RelaySelectionManager(
    //   _gsnTransactionDetails,
    //   api_GSN.relayProvider.relayClient.dependencies.knownRelaysManager,
    //   api_GSN.relayProvider.relayClient.dependencies.httpClient,
    //   api_GSN.relayProvider.relayClient.dependencies.pingFilter,
    //   api_GSN.relayProvider.relayClient.logger,
    //   api_GSN.relayProvider.relayClient.config
    // ).init()

    // const paymaster =
    //   api_GSN.relayProvider.relayClient.dependencies.contractInteractor.getDeployment()
    //     .paymasterAddress
    // const relayHub =
    //   api_GSN.relayProvider.relayClient.dependencies.contractInteractor.getDeployment()
    //     .relayHubAddress ?? ''

    // // trying to get relay info, its not working so i just hardcode it
    // const relaySelectionResult = await relaySelectionManager.selectNextRelay(relayHub, paymaster)
    // const activeRelay = relaySelectionResult?.relayInfo as RelayInfo
    // console.log('************* relayHub', JSON.stringify(relayHub))
    // console.log('************* paymaster', JSON.stringify(paymaster))
    // console.log('************* activeRelay', JSON.stringify(activeRelay))

    // const relayPingResponse = await fetch('https://relay-server-mumbai-dev.nexera.id/getaddr')
    // const pingResponse = await relayPingResponse.json() as PingResponse
    // console.log('************* pingResponse', JSON.stringify(pingResponse))

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

    // const jsonParams = {
    //   ..._gsnTransactionDetails,
    //   validUntilTime: relayRequest.request.validUntilTime
    // }

    // const jsonRpcPayload: JsonRpcPayload = {
    //   jsonrpc: '2.0',
    //   id: 1,
    //   method: 'eth_sendTransaction',
    //   params: [jsonParams],
    // }

    // const promisified = new Promise<any>((resolve, reject) => {
    //   api_GSN.relayProvider.send(
    //     jsonRpcPayload,
    //     (error?: Error | null, result?: JsonRpcResponse): void => {
    //       if (error != null) {
    //         reject(error)
    //       } else {
    //         resolve(result)
    //       }
    //     }
    //   )
    // })
    // const res = await promisified

    // console.log('************* res', JSON.stringify(res))

    // ================================= using API GSN provider =================================

    // const userBalanceBefore = await api_GSN.gsnProvider.getBalance(user_signer.address)

    // const chainId = 80001;
    // const nonce = await api_GSN.gsnProvider.getTransactionCount(user_signer.address);
    // const gasPrice = await api_GSN.gsnProvider.getGasPrice();
    // const gasLimit = ethers.BigNumber.from('50000') // await captureTheFlag.estimateGas.captureTheFlag();
    // const txWithReplayProtection = {
    //   ...metaTx,
    //   chainId,
    //   nonce,
    //   gasPrice,
    //   gasLimit,
    // };

    // const signedTx = await user_signer.signTransaction(txWithReplayProtection)

    // const options = {
    //   from: user_signer.address,
    //   to: CAPTURE_THE_FLAG_ADDRESS,
    //   data: captureTheFlag.interface.encodeFunctionData('captureTheFlag'),
    //   paymasterData: PAYMASTER_ADDRESS,
    //   clientId: '1',
    //   maxFeePerGas: '50000000000',
    //   maxPriorityFeePerGas: '50000000000'
    // }

    // const relayingResult = await user_GSN.relayProvider.relayClient.wrappedUnderlyingSigner
    // console.log('************* relayingResult', JSON.stringify(relayingResult))

    // const validTransaction = relayingResult.transaction
    // if (validTransaction == null) {
    //   return
    // }
    // console.log('************* validTransaction', JSON.stringify(validTransaction))
    // const txHash: string = validTransaction.hash!

    // console.log('************* txHash', txHash)

    // const userBalanceAfter = await api_GSN.gsnProvider.getBalance(user_signer.address)

    // console.log('************* userBalanceBefore', userBalanceBefore.toString())
    // console.log('************* userBalanceAfter', userBalanceAfter.toString())
    // console.log('************* diff', userBalanceBefore.sub(userBalanceAfter).toString())

    // const balanceAfter = await nxraToken.balanceOf(user_signer.address)
    // console.log('************* nxra balanceBefore', balanceBefore.toString())
    // console.log('************* nxra balanceAfter', balanceAfter.toString())
    // console.log('************* nxra diff', balanceBefore.sub(balanceAfter).toString())

    // =========================================================================================

    // ================================= using API GSN provider =================================

    // const chainId = 80001;
    // const nonce = await api_GSN.gsnProvider.getTransactionCount(user_signer.address);
    // const gasPrice = await api_GSN.gsnProvider.getGasPrice();
    // const gasLimit = ethers.BigNumber.from('50000') // await captureTheFlag.estimateGas.captureTheFlag();
    // const txWithReplayProtection = {
    //   ...metaTx,
    //   chainId,
    //   nonce,
    //   gasPrice,
    //   gasLimit,
    // };

    // const signedTx = await user_signer.signTransaction(txWithReplayProtection)

    // const blockNumber = await api_GSN.gsnProvider.getBlockNumber()
    // console.log('************* blockNumber', blockNumber.toString())

    // const userBalanceBefore = await api_GSN.gsnProvider.getBalance(user_signer.address)

    // const gsnTx = await api_GSN.relayProvider._fixGasFees(txWithReplayProtection)

    // console.log('************* gsnTx', JSON.stringify(gsnTx))

    // const tx = await api_GSN.relayProvider.relayClient.relayTransaction({
    //   from : user_signer.address,
    //   to: CAPTURE_THE_FLAG_ADDRESS,
    //   data: captureTheFlag.interface.encodeFunctionData('captureTheFlag'),
    //   paymasterData: PAYMASTER_ADDRESS,
    //   maxFeePerGas: '50000000000',
    //   maxPriorityFeePerGas: '50000000000'
    // })

    // // wait 10 seconds
    // await new Promise(resolve => setTimeout(resolve, 10000))

    // console.log('************* tx', JSON.stringify(tx))

    // // console.log('Transaction hash:', tx.hash);

    // // const receipt = await tx.wait();
    // // console.log('************* receipt', JSON.stringify(receipt))

    // const userBalanceAfter = await api_GSN.gsnProvider.getBalance(user_signer.address)

    // console.log('************* userBalanceBefore', userBalanceBefore.toString())
    // console.log('************* userBalanceAfter', userBalanceAfter.toString())
    // console.log('************* diff', userBalanceBefore.sub(userBalanceAfter).toString())

    // const balanceAfter = await nxraToken.balanceOf(user_signer.address)
    // console.log('************* nxra balanceBefore', balanceBefore.toString())
    // console.log('************* nxra balanceAfter', balanceAfter.toString())
    // console.log('************* nxra diff', balanceBefore.sub(balanceAfter).toString())

    // =========================================================================================

    // ================================= using mumbai provider =================================

    // const chainId = 80001;
    // const nonce = await mumbaiProvider.getTransactionCount(user_signer.address);
    // const gasPrice = await mumbaiProvider.getGasPrice();
    // const gasLimit = ethers.BigNumber.from('50000') // await captureTheFlag.estimateGas.captureTheFlag();
    // const txWithReplayProtection = {
    //   ...metaTx,
    //   chainId,
    //   nonce,
    //   gasPrice,
    //   gasLimit,
    // };

    // const signedTx = await user_signer.signTransaction(txWithReplayProtection)

    // const blockNumber = await mumbaiProvider.getBlockNumber()
    // console.log('************* blockNumber', blockNumber.toString())

    // const userBalanceBefore = await mumbaiProvider.getBalance(user_signer.address)

    // const tx = await mumbaiProvider.sendTransaction(signedTx);
    // console.log('Transaction hash:', tx.hash);

    // const receipt = await tx.wait();
    // console.log('************* receipt', JSON.stringify(receipt))

    // const userBalanceAfter = await mumbaiProvider.getBalance(user_signer.address)

    // console.log('************* userBalanceBefore', userBalanceBefore.toString())
    // console.log('************* userBalanceAfter', userBalanceAfter.toString())
    // console.log('************* diff', userBalanceBefore.sub(userBalanceAfter).toString())

    // =========================================================================================

    // ======================== using user signer and user gsn provider ========================

    // const tx = await user_GSN.gsnSigner.sendTransaction(metaTx)
    // const receipt = await tx.wait()

    // console.log('************* receipt', JSON.stringify(receipt))

    // console.log('user_signer address', user_signer.address)

    // const balanceAfter = await nxraToken.balanceOf(user_signer.address)
    // console.log('************* balanceBefore', balanceBefore.toString())
    // console.log('************* balanceAfter', balanceAfter.toString())
    // console.log('************* diff', balanceBefore.sub(balanceAfter).toString())

    // =========================================================================================
  })
})
