import { useState, useDeferredValue } from 'react'
import type { CreditClient } from '../../api/creditApi'
import type { CreditClient as CreditClientRecord } from '../../api/pumpApi'
import { SkeletonRows } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { EmptyState } from '../../components/EmptyState'
import { IconButton } from '../../components/IconButton'
import { onActivateKey } from '../../utils/keyboard'
import { SetCreditLimitModal } from './modals/SetCreditLimitModal'
import { GenerateAllInvoicesModal } from './modals/GenerateAllInvoicesModal'
import { formatDecimal } from '../../utils/format'

interface LedgerTabProps {
  pumpId: number | null
  clients: CreditClient[]
  allCreditClients: CreditClientRecord[]
  isLoading: boolean
  hasError: boolean
  canAdjustLimit: boolean
  canIssueInvoices: boolean
  onSelectClient: (client: CreditClient) => void
}

export function LedgerTab({ pumpId, clients, allCreditClients, isLoading, hasError, canAdjustLimit, canIssueInvoices, onSelectClient }: LedgerTabProps) {
  const [showLimitModal, setShowLimitModal] = useState<CreditClient | null>(null)
  const [showGenerateAllModal, setShowGenerateAllModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearch = useDeferredValue(searchQuery)

  const [expandedParentId, setExpandedParentId] = useState<number | null>(null)
  const toggleParent = (id: number) =>
    setExpandedParentId(prev => prev === id ? null : id)

  return (
    <>
      {showLimitModal && pumpId && (
        <SetCreditLimitModal
          client={showLimitModal}
          pumpId={pumpId}
          onClose={() => setShowLimitModal(null)}
        />
      )}
      {showGenerateAllModal && pumpId && (
        <GenerateAllInvoicesModal pumpId={pumpId} onClose={() => setShowGenerateAllModal(false)} />
      )}
      {canIssueInvoices && pumpId && clients.length > 0 && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setShowGenerateAllModal(true)} className="ui-btn ui-btn-secondary">
            Generate invoices for all clients
          </button>
        </div>
      )}
      <Reveal delay={120}>
      <div className="ui-search-shell">
        <svg className="ui-search-shell__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input aria-label="Search clients by name or phone"
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by client name or phone…"
          className="ui-search-shell__input text-sm leading-5"
        />
        {searchQuery && (
          <IconButton
            onClick={() => setSearchQuery('')}
            className="ui-search-shell__clear"
            label="Clear search"
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>}
          />
        )}
      </div>
      </Reveal>

      {isLoading && (
        <Reveal delay={150}>
        <div className="ui-card px-5 py-4">
          <SkeletonRows count={5} />
        </div>
        </Reveal>
      )}

      {hasError && (
        <div role="alert" className="ui-alert ui-alert-danger text-sm">
          Failed to load credit data. Please try again.
        </div>
      )}

      {!isLoading && clients.length === 0 && (
        <Reveal delay={150}>
        <div className="ui-card">
          <EmptyState
            icon="transactions"
            title="No credit clients yet"
            subtitle="Go to the Clients tab to add credit clients."
          />
        </div>
        </Reveal>
      )}

      {!isLoading && clients.length > 0 && (() => {
        // Use allCreditClients (full list) for reliable parentClientId / isParent structure.
        // clients (ledger) has balances; allCreditClients has the hierarchy.
        const structureMap = new Map(allCreditClients.map(c => [c.id, c]))

        // A client is a child if allCreditClients says so — never rely on ledger's parentClientId
        const isChildId = (id: number) => !!structureMap.get(id)?.parentClientId

        // Build a map: parentId → ledger entries for each child
        const childMap = new Map<number, typeof clients>()
        allCreditClients.forEach(sc => {
          if (!sc.parentClientId) return
          const ledgerEntry = clients.find(c => c.id === sc.id)
          if (ledgerEntry) {
            const arr = childMap.get(sc.parentClientId) ?? []
            arr.push(ledgerEntry)
            childMap.set(sc.parentClientId, arr)
          }
        })

        // Root clients = those that are NOT children in the full structure, filtered by search.
        // A parent matches if its own name/phone matches OR any of its sub-accounts match.
        const q = deferredSearch.trim().toLowerCase()
        const rootClients = clients
          .filter(c => {
            if (isChildId(c.id)) return false
            if (!q) return true
            const matchesSelf = c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q)
            const children = childMap.get(c.id) ?? []
            const matchesChild = children.some(ch => ch.name.toLowerCase().includes(q) || (ch.phone ?? '').includes(q))
            return matchesSelf || matchesChild
          })

        const renderClientCard = (client: typeof clients[0], isChild = false) => {
          const isActualChild = isChild || isChildId(client.id)
          const limitPct = client.creditLimit > 0
            ? Math.min(100, (client.outstandingBalance / client.creditLimit) * 100)
            : null
          const isNearLimit  = limitPct !== null && limitPct >= 80
          const children     = childMap.get(client.id) ?? []
          const hasChildren  = !isActualChild && children.length > 0
          const isExpanded   = expandedParentId === client.id

          return (
            <div
              key={client.id}
              className={`ui-card px-4 py-4 sm:px-5 flex flex-wrap items-center gap-x-4 gap-y-3 transition-all ${
                isActualChild ? 'ml-8 border-l-4 border-l-blue-200 hover:border-blue-300 hover:shadow-sm' :
                hasChildren   ? 'cursor-pointer hover:border-blue-400 hover:shadow-sm select-none' :
                                'hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              <div className={`w-10 h-10 rounded-full font-bold flex items-center justify-center flex-shrink-0 text-sm ${
                isActualChild ? 'bg-blue-50 text-blue-500' : 'bg-blue-100 text-blue-700'
              }`}>
                {client.name.charAt(0).toUpperCase()}
              </div>

              <div
                  className="flex-1 min-w-[9rem]"
                  role={hasChildren ? 'button' : undefined}
                  tabIndex={hasChildren ? 0 : undefined}
                  aria-expanded={hasChildren ? isExpanded : undefined}
                  onClick={hasChildren ? () => toggleParent(client.id) : undefined}
                  onKeyDown={hasChildren ? onActivateKey(() => toggleParent(client.id)) : undefined}
                >
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800 truncate">{client.name}</p>
                  {isActualChild && (
                    <span className="text-xs bg-blue-50 text-blue-500 border border-blue-200 px-1.5 py-0.5 rounded font-medium">
                      sub-account
                    </span>
                  )}
                  {hasChildren && (
                    <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                      {children.length} sub-account{children.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">{client.phone}</p>
                {!isActualChild && client.creditLimit > 0 && (
                  <div className="mt-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isNearLimit ? 'bg-red-500' : 'bg-blue-400'}`}
                          style={{ width: `${limitPct}%` }}
                        />
                      </div>
                      <span className={`text-xs ${isNearLimit ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                        {limitPct?.toFixed(0)}% of limit
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-right flex-shrink-0 hidden sm:block space-y-0.5">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Credit Limit</p>
                  {isActualChild ? (
                    <p className="text-sm font-medium text-blue-500">Shared with parent</p>
                  ) : (
                    <p className="text-sm font-medium text-slate-600">
                      {client.creditLimit > 0 ? `₹${formatDecimal(client.creditLimit)}` : 'Unlimited'}
                    </p>
                  )}
                </div>
                {client.monthlyInterestRate > 0 && (
                  <p className="text-xs text-purple-600 font-medium">{client.monthlyInterestRate}%/mo interest</p>
                )}
              </div>

              <div className="flex-shrink-0 sm:text-right sm:w-28">
                <p className="text-xs text-slate-500 mb-0.5">Outstanding</p>
                <p className={`text-base font-bold ${client.outstandingBalance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  ₹{formatDecimal(client.outstandingBalance)}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                {canAdjustLimit && !isActualChild && (
                  <IconButton
                    onClick={() => setShowLimitModal(client)}
                    className="text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    label="Set credit limit"
                    icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>}
                  />
                )}
                <button
                  onClick={() => onSelectClient(client)}
                  className="ui-btn ui-btn-secondary ui-btn-compact"
                >
                  View Ledger
                </button>
              </div>

              {hasChildren && (
                <svg
                  className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </div>
          )
        }

        if (rootClients.length === 0 && q) {
          return (
            <div className="ui-card">
              <EmptyState
                icon="generic"
                title={`No clients match "${deferredSearch.trim()}"`}
                subtitle="Try a different name or phone number."
              />
            </div>
          )
        }

        return (
          <div className="space-y-3">
            {rootClients.map(root => {
              const children   = childMap.get(root.id) ?? []
              const isExpanded = expandedParentId === root.id
              return (
                <div key={root.id} className="space-y-2">
                  {renderClientCard(root)}
                  {children.length > 0 && isExpanded && children.map(child => renderClientCard(child, true))}
                </div>
              )
            })}
          </div>
        )
      })()}
    </>
  )
}
