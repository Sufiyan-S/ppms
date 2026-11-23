import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creditApi } from '../../api/creditApi'
import type { CreditClient, CreditTransaction } from '../../api/creditApi'
import { pumpApi } from '../../api/pumpApi'
import { useClientLedger } from './useClientLedger'

vi.mock('../../api/creditApi', () => ({
  creditApi: {
    getLedgerSummary: vi.fn(),
    getActiveExtensions: vi.fn(),
    getAllTransactions: vi.fn(),
    getPendingPayments: vi.fn(),
  },
}))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getCreditClientAccounts: vi.fn() } }))

const PUMP_ID = 3
const PARENT_ID = 10
const CHILD_ID = 11

function clientRow(id: number, name: string, extra: Partial<CreditClient>): CreditClient {
  return { id, pumpId: PUMP_ID, name, parentClientId: null, isParent: false, ...extra } as CreditClient
}

function row(referenceId: number, clientId: number, clientName: string): CreditTransaction {
  return {
    type: 'SALE', referenceId, reference: null, referenceCode: null, referenceParams: {}, detail: null, amount: 100, runningBalance: 100,
    occurredAt: '2026-11-10T10:00:00+05:30', businessDate: '2026-11-10', status: 'ACTIVE', countedInBalance: true,
    clientId, clientName,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useClientLedger', () => {
  beforeEach(() => {
    vi.mocked(creditApi.getActiveExtensions).mockResolvedValue([])
    vi.mocked(creditApi.getPendingPayments).mockResolvedValue([])
  })

  it('loads a parent ledger with its sub-accounts in one request and splits the rows by account', async () => {
    const parent = clientRow(PARENT_ID, 'Acme', { isParent: true })
    const child = clientRow(CHILD_ID, 'Acme Truck 7', { parentClientId: PARENT_ID })
    vi.mocked(creditApi.getLedgerSummary).mockResolvedValue([parent])
    vi.mocked(pumpApi.getCreditClientAccounts).mockResolvedValue([parent, child] as never)
    vi.mocked(creditApi.getAllTransactions).mockResolvedValue([row(1, PARENT_ID, 'Acme'), row(2, CHILD_ID, 'Acme Truck 7')])

    const { result } = renderHook(() => useClientLedger(PUMP_ID, PARENT_ID, false), { wrapper })

    await waitFor(() => expect(result.current.transactions).toHaveLength(2))
    expect(creditApi.getAllTransactions).toHaveBeenCalledTimes(1)
    expect(creditApi.getAllTransactions).toHaveBeenCalledWith(PUMP_ID, PARENT_ID, true)
    expect(result.current.ownTransactions.map(tx => tx.referenceId)).toEqual([1])
    await waitFor(() => expect(result.current.childTransactionsByIndex[0]?.map(tx => tx.referenceId)).toEqual([2]))
    expect(result.current.transactions[1]).toMatchObject({ sourceClientId: CHILD_ID, subAccountName: 'Acme Truck 7' })
    expect(result.current.transactions[0].subAccountName).toBeUndefined()
  })

  it('asks only for the account itself when it has no sub-accounts', async () => {
    vi.mocked(creditApi.getLedgerSummary).mockResolvedValue([clientRow(PARENT_ID, 'Solo', {})])
    vi.mocked(creditApi.getAllTransactions).mockResolvedValue([row(1, PARENT_ID, 'Solo')])

    const { result } = renderHook(() => useClientLedger(PUMP_ID, PARENT_ID, false), { wrapper })

    await waitFor(() => expect(result.current.transactions).toHaveLength(1))
    expect(creditApi.getAllTransactions).toHaveBeenCalledWith(PUMP_ID, PARENT_ID, false)
  })
})
