import { Eip1193Bridge } from '@ethersproject/experimental'
import { Web3Provider } from '@ethersproject/providers'
import { createWeb3ReactStoreAndActions } from '@web3-react/store'
import type { Actions, ProviderRpcError, RequestArguments, Web3ReactStore } from '@web3-react/types'
import { EventEmitter } from 'node:events'
import { EIP1193 } from '.'

export async function yieldThread() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

class MockProviderRpcError extends Error {
  public code: number
  constructor() {
    super('Mock Provider RPC Error')
    this.code = 4200
  }
}

export class MockEIP1193Provider extends EventEmitter {
  public chainId?: string
  public accounts?: string[]

  public eth_chainId = jest.fn((chainId?: string) => chainId)
  public eth_accounts = jest.fn((accounts?: string[]) => accounts)
  public eth_requestAccounts = jest.fn((accounts?: string[]) => accounts)

  public request(x: RequestArguments): Promise<unknown> {
    // make sure to throw if we're "not connected"
    if (!this.chainId) return Promise.reject(new Error())

    switch (x.method) {
      case 'eth_chainId':
        return Promise.resolve(this.eth_chainId(this.chainId))
      case 'eth_accounts':
        return Promise.resolve(this.eth_accounts(this.accounts))
      case 'eth_requestAccounts':
        return Promise.resolve(this.eth_requestAccounts(this.accounts))
      default:
        throw new Error()
    }
  }

  public emitConnect(chainId: string) {
    this.emit('connect', { chainId })
  }

  public emitDisconnect(error: ProviderRpcError) {
    this.emit('disconnect', error)
  }

  public emitChainChanged(chainId: string) {
    this.emit('chainChanged', chainId)
  }

  public emitAccountsChanged(accounts: string[]) {
    this.emit('accountsChanged', accounts)
  }
}

const chainId = '0x1'
const accounts: string[] = []

describe('EIP1193', () => {
  let mockProvider: MockEIP1193Provider

  let store: Web3ReactStore
  let actions: Actions

  let connector: EIP1193

  beforeEach(() => {
    mockProvider = new MockEIP1193Provider()
    ;[store, actions] = createWeb3ReactStoreAndActions()
  })

  describe('ethers', () => {
    afterEach(() => {
      expect(mockProvider.eth_chainId.mock.calls.length).toBe(1)
      expect(mockProvider.eth_accounts.mock.calls.length).toBe(0)
      expect(mockProvider.eth_requestAccounts.mock.calls.length).toBe(1)
    })

    test('works', async () => {
      mockProvider.chainId = chainId
      mockProvider.accounts = accounts

      const web3Provider = new Web3Provider(mockProvider)
      const wrapped = new Eip1193Bridge(web3Provider.getSigner(), web3Provider)

      connector = new EIP1193({ actions, provider: wrapped, connectEagerly: false })

      await connector.activate()

      expect(store.getState()).toEqual({
        chainId: 1,
        accounts,
        activating: false,
      })
    })
  })

  describe('functions', () => {
    describe('connectEagerly = true', () => {
      beforeEach(() => {
        expect(mockProvider.eth_chainId.mock.calls.length).toBe(0)
        expect(mockProvider.eth_accounts.mock.calls.length).toBe(0)
        expect(mockProvider.eth_requestAccounts.mock.calls.length).toBe(0)
      })

      // suppress console.debugs in this block
      beforeEach(() => {
        jest.spyOn(console, 'debug').mockImplementation(() => {})
      })
      afterEach(() => {
        jest.clearAllMocks()
      })

      test('fails silently', async () => {
        connector = new EIP1193({ actions, provider: mockProvider, connectEagerly: true })
        await yieldThread()

        expect(store.getState()).toEqual({
          chainId: undefined,
          accounts: undefined,
          activating: false,
        })

        expect(mockProvider.eth_chainId.mock.calls.length).toBe(0)
        expect(mockProvider.eth_accounts.mock.calls.length).toBe(0)
        expect(mockProvider.eth_requestAccounts.mock.calls.length).toBe(0)
      })

      test('succeeds', async () => {
        mockProvider.chainId = chainId
        mockProvider.accounts = accounts

        connector = new EIP1193({ actions, provider: mockProvider, connectEagerly: true })
        await yieldThread()

        expect(store.getState()).toEqual({
          chainId: 1,
          accounts,
          activating: false,
        })

        expect(mockProvider.eth_chainId.mock.calls.length).toBe(1)
        expect(mockProvider.eth_accounts.mock.calls.length).toBe(1)
        expect(mockProvider.eth_requestAccounts.mock.calls.length).toBe(0)
      })
    })

    describe('connectEagerly = false', () => {
      beforeEach(() => {
        connector = new EIP1193({ actions, provider: mockProvider, connectEagerly: false })
      })

      beforeEach(() => {
        expect(mockProvider.eth_chainId.mock.calls.length).toBe(0)
        expect(mockProvider.eth_accounts.mock.calls.length).toBe(0)
        expect(mockProvider.eth_requestAccounts.mock.calls.length).toBe(0)
      })

      test('before', () => {
        expect(store.getState()).toEqual({
          chainId: undefined,
          accounts: undefined,
          activating: false,
        })
      })

      describe('#activate', () => {
        afterEach(() => {
          expect(mockProvider.eth_chainId.mock.calls.length).toBe(1)
          expect(mockProvider.eth_accounts.mock.calls.length).toBe(0)
          expect(mockProvider.eth_requestAccounts.mock.calls.length).toBe(1)
        })

        test(`chainId = ${chainId}`, async () => {
          mockProvider.chainId = chainId
          mockProvider.accounts = accounts

          await connector.activate()

          expect(store.getState()).toEqual({
            chainId: 1,
            accounts,
            activating: false,
          })
        })

        test("chainId = '0x01'", async () => {
          mockProvider.chainId = '0x01'
          mockProvider.accounts = accounts

          await connector.activate()

          expect(store.getState()).toEqual({
            chainId: 1,
            accounts,
            activating: false,
          })
        })

        test("accounts = ['0x0000000000000000000000000000000000000000']", async () => {
          const chainId = '0x1'
          const accounts: string[] = ['0x0000000000000000000000000000000000000000']

          mockProvider.chainId = chainId
          mockProvider.accounts = accounts

          await connector.activate()

          expect(store.getState()).toEqual({
            chainId: 1,
            accounts,
            activating: false,
          })
        })

        test("accounts = ['0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000001']", async () => {
          const chainId = '0x1'
          const accounts: string[] = [
            '0x0000000000000000000000000000000000000000',
            '0x0000000000000000000000000000000000000001',
          ]

          mockProvider.chainId = chainId
          mockProvider.accounts = accounts

          await connector.activate()

          expect(store.getState()).toEqual({
            chainId: 1,
            accounts,
            activating: false,
          })
        })
      })
    })
  })

  describe('events', () => {
    beforeEach(() => {
      connector = new EIP1193({ actions, provider: mockProvider, connectEagerly: false })
    })

    afterEach(() => {
      expect(mockProvider.eth_chainId.mock.calls.length).toBe(0)
      expect(mockProvider.eth_accounts.mock.calls.length).toBe(0)
      expect(mockProvider.eth_requestAccounts.mock.calls.length).toBe(0)
    })

    const chainId = '0x1'
    const accounts: string[] = []
    const error = new MockProviderRpcError()

    test('#connect', async () => {
      mockProvider.emitConnect(chainId)

      expect(store.getState()).toEqual({
        chainId: 1,
        accounts: undefined,
        activating: false,
        error: undefined,
      })
    })

    test('#disconnect', async () => {
      mockProvider.emitDisconnect(error)

      expect(store.getState()).toEqual({
        chainId: undefined,
        accounts: undefined,
        activating: false,
      })
    })

    test('#chainChanged', async () => {
      mockProvider.emitChainChanged(chainId)

      expect(store.getState()).toEqual({
        chainId: 1,
        accounts: undefined,
        activating: false,
      })
    })

    test('#accountsChanged', async () => {
      mockProvider.emitAccountsChanged(accounts)

      expect(store.getState()).toEqual({
        chainId: undefined,
        accounts,
        activating: false,
      })
    })

    test('initializes with connect', async () => {
      mockProvider.emitConnect(chainId)
      mockProvider.emitAccountsChanged(accounts)

      expect(store.getState()).toEqual({
        chainId: 1,
        accounts,
        activating: false,
      })
    })

    test('initializes with chainChanged', async () => {
      mockProvider.emitChainChanged(chainId)
      mockProvider.emitAccountsChanged(accounts)

      expect(store.getState()).toEqual({
        chainId: 1,
        accounts,
        activating: false,
      })
    })
  })
})
