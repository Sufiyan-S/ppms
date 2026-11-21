import { Landmark, Check, AlertTriangle } from 'lucide-react'
import type { Settlement, SettlementPaymentType } from '../../api/paymentSettlementApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { SkeletonRows } from '../../components/Skeleton'
import { TYPE_ACCENT, TYPE_ICONS, TYPE_LABELS, fmtAmt, fmtDate } from './settlementFormat'
import type { SettlementHistory } from './useSettlementHistory'

interface SettlementRecordsTabProps {
  history: SettlementHistory
  canVoid: boolean
  onVoid: (settlement: Settlement) => void
}

export function SettlementRecordsTab({ history, canVoid, onVoid }: SettlementRecordsTabProps) {
  const {
    filterFrom, setFilterFrom, filterTo, setFilterTo, typeFilter, setTypeFilter,
    setSummaryPage, setSummaryPageSize, dailySummaryPage, dailySummary, loadingList,
  } = history

  return (
    <div className="ui-card p-0 overflow-hidden">
      {/* Toolbar: date range + type filter */}
      <div className="ui-toolbar">
        <p className="ui-toolbar-title">Settlement History</p>
        <div className="ui-toolbar-actions">
          <input aria-label="From date"
            type="date"
            value={filterFrom}
            max={filterTo}
            onChange={e => { setFilterFrom(e.target.value); setSummaryPage(0) }}
            style={{ width: '155px', minHeight: '36px' }}
            className="text-sm"
          />
          <span className="text-slate-500 text-sm">–</span>
          <input aria-label="To date"
            type="date"
            value={filterTo}
            min={filterFrom}
            onChange={e => { setFilterTo(e.target.value); setSummaryPage(0) }}
            style={{ width: '155px', minHeight: '36px' }}
            className="text-sm"
          />
          <div style={{ width: '160px' }}>
            <SearchableSelect label="Filter by payment type"
              value={typeFilter}
              onChange={v => setTypeFilter(v as SettlementPaymentType | '')}
              options={[
                { value: '',           label: 'All Types'  },
                { value: 'UPI',        label: 'UPI'        },
                { value: 'CARD',       label: 'Card'       },
                { value: 'FLEET_CARD', label: 'Fleet Card' },
              ]}
              size="sm"
            />
          </div>
        </div>
      </div>

      {loadingList ? (
        <div className="px-5 py-4"><SkeletonRows count={5} /></div>
      ) : dailySummary.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 text-center px-6">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-1"><Landmark size={26} strokeWidth={1.5} className="text-slate-500" /></div>
          <p className="font-semibold text-slate-700">No activity in this date range</p>
          <p className="text-sm text-slate-500 max-w-sm">
            No shift collections or settlements were found between the selected dates.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {dailySummary.map(entry => {
            const visibleSettlements = typeFilter
              ? entry.settlements.filter(s => s.paymentType === typeFilter)
              : entry.settlements

            const collectedByType = ([
              { type: 'UPI',        collected: entry.upiCollected,        settled: entry.upiSettled        },
              { type: 'CARD',       collected: entry.cardCollected,       settled: entry.cardSettled       },
              { type: 'FLEET_CARD', collected: entry.fleetCardCollected,  settled: entry.fleetCardSettled  },
            ] as { type: SettlementPaymentType; collected: number; settled: number }[]).filter(r => typeFilter ? r.type === typeFilter : r.collected > 0 || r.settled > 0)

            if (collectedByType.length === 0 && visibleSettlements.length === 0) return null

            return (
              <div key={entry.date} className="px-5 py-4 space-y-3">
                {/* Date header */}
                <p className="text-sm font-bold text-slate-700">{fmtDate(entry.date)}</p>

                {/* Collected vs Settled per type */}
                {collectedByType.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {collectedByType.map(({ type, collected, settled }) => {
                      const accent   = TYPE_ACCENT[type]
                      const balance  = collected - settled
                      const balanced = balance <= 0
                      return (
                        <div key={type} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${accent.badge}`}>
                              {TYPE_ICONS[type]} {TYPE_LABELS[type]}
                            </span>
                            {balanced
                              ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><Check size={11} strokeWidth={2.5} />Settled</span>
                              : <span className="text-xs text-amber-600 font-medium">In transit</span>
                            }
                          </div>
                          <div className="flex justify-between text-xs text-slate-500 mt-0.5">
                            <span>Collected</span>
                            <span className="font-semibold text-slate-700 tabular-nums">{fmtAmt(collected)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>Settled</span>
                            <span className="font-semibold text-emerald-700 tabular-nums">{fmtAmt(settled)}</span>
                          </div>
                          {!balanced && (
                            <div className="flex justify-between text-xs border-t border-dashed border-slate-200 pt-1 mt-0.5">
                              <span className="text-amber-600">Pending</span>
                              <span className="font-bold text-amber-700 tabular-nums">{fmtAmt(balance)}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Individual settlement records */}
                {visibleSettlements.length > 0 && (
                  <div className="space-y-1.5 pl-1">
                    {visibleSettlements.map(s => {
                      const accent    = TYPE_ACCENT[s.paymentType]
                      const isVoided  = s.voidStatus === 'VOIDED'
                      const shortfall = s.isPartial && s.pendingAtRecordTime != null
                        ? s.pendingAtRecordTime - s.amountReceived
                        : 0
                      return (
                        <div key={s.id} className={`flex flex-wrap items-start gap-x-3 gap-y-1 ${isVoided ? 'opacity-60' : ''}`}>
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${accent.badge}`}>
                            {TYPE_ICONS[s.paymentType]} {TYPE_LABELS[s.paymentType]}
                          </span>
                          <div className="order-last basis-full min-w-0 sm:order-none sm:basis-0 sm:flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isVoided && (
                                <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                  Voided
                                </span>
                              )}
                              {!isVoided && s.isPartial && (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                  <AlertTriangle size={11} strokeWidth={2} />Partial · {fmtAmt(shortfall)} short
                                </span>
                              )}
                              <span className="text-xs text-slate-500 truncate">
                                {s.notes ? `${s.notes} · ` : ''}by {s.recordedByUserName}
                              </span>
                            </div>
                            {!isVoided && s.isPartial && s.pendingAtRecordTime != null && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                Expected {fmtAmt(s.pendingAtRecordTime)} · received {fmtAmt(s.amountReceived)}
                              </p>
                            )}
                            {isVoided && s.voidReason && (
                              <p className="text-xs text-red-600 mt-0.5">Reason: {s.voidReason}</p>
                            )}
                          </div>
                          <span className={`text-sm font-bold tabular-nums flex-shrink-0 ml-auto sm:ml-0 ${isVoided ? 'text-slate-500 line-through' : 'text-emerald-700'}`}>
                            +{fmtAmt(s.amountReceived)}
                          </span>
                          {canVoid && !isVoided && (
                            <button
                              type="button"
                              onClick={() => onVoid(s)}
                              className="ui-btn ui-btn-danger ui-btn-compact flex-shrink-0"
                            >
                              Void
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {dailySummaryPage && dailySummaryPage.totalElements > 0 && (
        <div className="px-5 border-t border-slate-100">
          <Pagination
            data={dailySummaryPage}
            onPageChange={p => setSummaryPage(p)}
            onPageSizeChange={s => { setSummaryPageSize(s); setSummaryPage(0) }}
            pageSizeOptions={[10, 20, 50]}
          />
        </div>
      )}
    </div>
  )
}
