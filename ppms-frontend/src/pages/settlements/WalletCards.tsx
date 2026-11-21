import { Clock, CheckCircle2, Check, ArrowRight } from 'lucide-react'
import type { SettlementPaymentType, WalletSummary } from '../../api/paymentSettlementApi'
import { TYPES, TYPE_ACCENT, TYPE_ICONS, TYPE_LABELS, fmtAmt, getPending } from './settlementFormat'

interface WalletCardsProps {
  wallet: WalletSummary | undefined
  loadingWallet: boolean
  canWrite: boolean
  onRecord: (type: SettlementPaymentType) => void
}

export function WalletCards({ wallet, loadingWallet, canWrite, onRecord }: WalletCardsProps) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        {loadingWallet
          ? TYPES.map(t => <div key={t} className="ui-dashboard-stat animate-pulse h-28" />)
          : TYPES.map(type => {
              const pending = getPending(wallet, type)
              const accent  = TYPE_ACCENT[type]
              const settled = pending <= 0
              return (
                <div key={type} className="ui-dashboard-stat">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      {TYPE_LABELS[type]}
                    </span>
                    <div className={`w-9 h-9 ${accent.icon} rounded-xl flex items-center justify-center text-white shadow-sm`}>
                      {TYPE_ICONS[type]}
                    </div>
                  </div>
                  <p className={`text-2xl font-bold tabular-nums tracking-tight ${settled ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {fmtAmt(pending)}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-xs font-medium ${settled ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {settled
                        ? <span className="inline-flex items-center gap-1"><Check size={11} strokeWidth={2.5} />Fully settled</span>
                        : 'In transit'
                      }
                    </span>
                    {canWrite && !settled && (
                      <button
                        onClick={() => onRecord(type)}
                        className="ui-btn ui-btn-secondary ui-btn-compact"
                      >
                        Record<ArrowRight size={12} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })
        }
      </div>

      {/* ── Total in-transit banner ── */}
      {wallet && (
        <div className={`rounded-xl border px-4 py-3 mb-6 flex items-center gap-3 ${
          wallet.totalPending > 0
            ? 'bg-amber-50 border-amber-200'
            : 'bg-emerald-50 border-emerald-200'
        }`}>
          <span className="leading-none">
            {wallet.totalPending > 0
              ? <Clock size={18} strokeWidth={2} className="text-amber-500" />
              : <CheckCircle2 size={18} strokeWidth={2} className="text-emerald-500" />
            }
          </span>
          <div className="flex-1">
            <span className={`text-sm font-medium ${wallet.totalPending > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
              {wallet.totalPending > 0
                ? 'Total amount still in transit — not yet credited to your bank account'
                : 'All payments have been settled — no pending amounts'}
            </span>
          </div>
          <span className={`text-lg font-bold tabular-nums ${wallet.totalPending > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {fmtAmt(wallet.totalPending)}
          </span>
        </div>
      )}
    </>
  )
}
