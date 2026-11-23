import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { creditApi } from '../../api/creditApi'
import type { CreditExtension } from '../../api/creditApi'
import { pumpApi } from '../../api/pumpApi'
import type { MergedTx } from './ledgerGroups'
import { FULL_HISTORY_QUERY_OPTIONS } from '../../queryClient'

export function useClientLedger(pumpId: number, clientId: number, canApprovePayments: boolean) {
  // Subscribe to the ledger summary so it refreshes automatically after a payment
  const { data: allClients = [], isLoading: clientsLoading, isError: clientsFailed } = useQuery({
    queryKey: ['credit-ledger', pumpId],
    queryFn: () => creditApi.getLedgerSummary(pumpId),
  })
  const client = allClients.find(c => c.id === clientId)

  // Full client list (needed to discover children, which may have 0 balance and not appear in ledger)
  const { data: pumpClientsData } = useQuery({
    queryKey: ['creditClients', pumpId],
    queryFn:  () => pumpApi.getCreditClientAccounts(pumpId),
    enabled:  client?.isParent === true,
  })
  const childClients = useMemo(
    () => (pumpClientsData ?? []).filter(c => c.parentClientId === clientId),
    [pumpClientsData, clientId],
  )

  // Active credit extensions for this client
  const { data: activeExtensions = [] } = useQuery<CreditExtension[]>({
    queryKey: ['active-extensions', pumpId, clientId],
    queryFn: () => creditApi.getActiveExtensions(pumpId, clientId),
    enabled: !!client,
  })

  // The whole ledger is loaded so filters, month chips and week totals cover every row, not one page.
  const isParent = client?.isParent === true
  const { data: ledgerRows = [], isLoading } = useQuery({
    queryKey: ['credit-transactions', pumpId, clientId, 'all', isParent],
    queryFn: () => creditApi.getAllTransactions(pumpId, clientId, isParent),
    enabled: !!client,
    ...FULL_HISTORY_QUERY_OPTIONS,
  })
  const ownTransactions = useMemo(
    () => ledgerRows.filter(tx => (tx.clientId ?? clientId) === clientId),
    [ledgerRows, clientId],
  )

  // outstandingInterest and totalInterestRecovered are now embedded in the client response —
  // no separate API call needed. Fall back to 0 while the client data is loading.
  const outstandingInterest   = client?.outstandingInterest   ?? 0
  const totalInterestRecovered = client?.totalInterestRecovered ?? 0

  const childTransactionsByIndex = useMemo(
    () => childClients.map((child): MergedTx[] =>
      ledgerRows
        .filter(tx => tx.clientId === child.id)
        .map(tx => ({ ...tx, subAccountName: child.name, sourceClientId: child.id }))
    ),
    [childClients, ledgerRows],
  )

  const { data: pendingPayments = [] } = useQuery({
    queryKey: ['credit-pending-payments', pumpId],
    queryFn: () => creditApi.getPendingPayments(pumpId),
    enabled: canApprovePayments,
  })
  const pendingPaymentRecorders = useMemo(
    () => new Map(pendingPayments.map(p => [p.id, p.recordedById])),
    [pendingPayments],
  )

  const transactions: MergedTx[] = useMemo(
    () => ledgerRows.map(tx => ({
      ...tx,
      sourceClientId: tx.clientId ?? clientId,
      subAccountName: tx.clientId != null && tx.clientId !== clientId ? tx.clientName : undefined,
    })),
    [ledgerRows, clientId],
  )

  return {
    allClients, client, clientsLoading, clientsFailed, childClients, activeExtensions, isParent, ownTransactions, isLoading,
    outstandingInterest, totalInterestRecovered, childTransactionsByIndex,
    pendingPaymentRecorders, transactions,
  }
}
