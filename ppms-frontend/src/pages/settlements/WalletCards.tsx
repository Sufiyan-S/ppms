import { Clock, CheckCircle2, Check, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SettlementPaymentType, WalletSummary } from '../../api/paymentSettlementApi'
import { MoneyText } from '../../components/AmountText'
import { KpiRow } from '../../components/layout/DashboardGrid'
import { TYPES, TYPE_ACCENT, TYPE_ICONS, getPending, typeLabel } from './settlementFormat'

interface WalletCardsProps {
  wallet: WalletSummary | undefined
  loadingWallet: boolean
  canWrite: boolean
  onRecord: (type: SettlementPaymentType) => void
}

export function WalletCards({ wallet, loadingWallet, canWrite, onRecord }: WalletCardsProps) {
  const { t } = useTranslation('settlements')
  return (
    <>
      <KpiRow label={t('wallet.label')} columns={3}>
        {loadingWallet
          ? TYPES.map(type => <div key={type} className="ui-dashboard-stat animate-pulse h-28" />)
          : TYPES.map(type => {
              const pending = getPending(wallet, type)
              const accent  = TYPE_ACCENT[type]
              const settled = pending <= 0
              return (
                <div key={type} className="ui-dashboard-stat">
                  <div className="flex items-center justify-between mb-3">
                    <span className="ui-kpi-label">
                      {typeLabel(type)}
                    </span>
                    <div className={`w-9 h-9 ${accent.icon} rounded-card flex items-center justify-center text-on-primary shadow-raised`}>
                      {TYPE_ICONS[type]}
                    </div>
                  </div>
                  <p className="text-2xl font-bold tracking-tight">
                    <MoneyText value={pending} tone={settled ? 'ok' : 'warn'} />
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-xs font-medium ${settled ? 'text-ok' : 'text-warn'}`}>
                      {settled
                        ? <span className="inline-flex items-center gap-1"><Check size={11} strokeWidth={2.5} aria-hidden="true" />{t('wallet.fullySettled')}</span>
                        : t('wallet.inTransit')
                      }
                    </span>
                    {canWrite && !settled && (
                      <button
                        onClick={() => onRecord(type)}
                        className="ui-btn ui-btn-secondary ui-btn-compact"
                      >
                        {t('wallet.record')}<ArrowRight size={12} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })
        }
      </KpiRow>

      {/* ── Total in-transit banner ── */}
      {wallet && (
        <div className={`rounded-card border px-4 py-3 flex items-center gap-3 ${
          wallet.totalPending > 0
            ? 'bg-warn-bg border-warn'
            : 'bg-ok-bg border-ok'
        }`}>
          <span className="leading-none">
            {wallet.totalPending > 0
              ? <Clock size={18} strokeWidth={2} className="text-warn" aria-hidden="true" />
              : <CheckCircle2 size={18} strokeWidth={2} className="text-ok" aria-hidden="true" />
            }
          </span>
          <div className="flex-1">
            <span className={`text-sm font-medium ${wallet.totalPending > 0 ? 'text-warn-strong' : 'text-ok'}`}>
              {wallet.totalPending > 0
                ? t('wallet.totalInTransit')
                : t('wallet.allSettled')}
            </span>
          </div>
          <MoneyText value={wallet.totalPending} tone={wallet.totalPending > 0 ? 'warn' : 'ok'} className="text-lg font-bold" />
        </div>
      )}
    </>
  )
}
