import { useTranslation } from 'react-i18next'
import type { CreditClient } from '../../api/creditApi'
import { onActivateKey } from '../../utils/keyboard'
import { formatDecimal } from '../../utils/format'
import { MoneyText } from '../../components/AmountText'

interface ClientSummaryCardsProps {
  client: CreditClient
  hasSubAccounts: boolean
  outstandingBalance: number
  /** Payments recorded but not yet approved; they are not deducted from the outstanding balance. */
  pendingApprovalTotal: number
  outstandingInterest: number
  totalInterestRecovered: number
  transactionCount: number
  canManageInterest: boolean
  onOpenInterestSettings: () => void
}

export function ClientSummaryCards({
  client, hasSubAccounts, outstandingBalance, pendingApprovalTotal, outstandingInterest, totalInterestRecovered,
  transactionCount, canManageInterest, onOpenInterestSettings,
}: ClientSummaryCardsProps) {
  const { t } = useTranslation('credit')
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
      <div className="ui-card">
        <p className="text-xs text-ink-3 uppercase tracking-wide mb-1">
          {hasSubAccounts ? t('summaryCards.outstandingCombined') : t('summaryCards.outstanding')}
        </p>
        <p className={`text-lg font-bold ${outstandingBalance > 0 ? 'text-warn' : 'text-ok'}`}>
          <MoneyText value={outstandingBalance} />
        </p>
        {pendingApprovalTotal > 0 && (
          <p className="text-xs font-medium text-warn mt-0.5">{t('summaryCards.pendingApproval', { amount: `₹${formatDecimal(pendingApprovalTotal)}` })}</p>
        )}
        {hasSubAccounts && (
          <p className="text-xs text-ink-3 mt-0.5">{t('summaryCards.parentAndSubAccounts')}</p>
        )}
      </div>
      <div className={`ui-card ${outstandingInterest > 0 ? 'border-info/30 bg-info-bg' : ''}`}>
        <p className="text-xs text-ink-3 uppercase tracking-wide mb-1">{t('summaryCards.interestDue')}</p>
        <p className={`text-lg font-bold ${outstandingInterest > 0 ? 'text-info' : 'text-ink-3'}`}>
          <MoneyText value={outstandingInterest} />
        </p>
        <p className="text-xs text-ink-3 mt-0.5">{t('summaryCards.ofOutstandingBalance')}</p>
      </div>
      <div className="ui-card">
        <p className="text-xs text-ink-3 uppercase tracking-wide mb-1">{t('summaryCards.interestRecovered')}</p>
        <p className={`text-lg font-bold ${totalInterestRecovered > 0 ? 'text-ok' : 'text-ink-3'}`}>
          <MoneyText value={totalInterestRecovered} />
        </p>
        {hasSubAccounts && (
          <p className="text-xs text-ink-3 mt-0.5">{t('summaryCards.parentAndSubAccounts')}</p>
        )}
      </div>
      <div
        className={`ui-card ${canManageInterest ? 'cursor-pointer hover:border-info hover:bg-info-bg transition-colors' : 'border-border'}`}
        onClick={canManageInterest ? onOpenInterestSettings : undefined}
        role={canManageInterest ? 'button' : undefined}
        tabIndex={canManageInterest ? 0 : undefined}
        aria-label={canManageInterest ? t('summaryCards.configureInterestRate') : undefined}
        onKeyDown={canManageInterest ? onActivateKey(onOpenInterestSettings) : undefined}
        title={canManageInterest ? t('summaryCards.clickToConfigureInterestRate') : undefined}
      >
        <p className="text-xs text-ink-3 uppercase tracking-wide mb-1">{t('summaryCards.interestRate')}</p>
        {client.parentClientId != null ? (
          <p className="text-sm font-medium text-ink-3">{t('summaryCards.setOnParent')}</p>
        ) : (
          <p className={`text-lg font-bold ${client.monthlyInterestRate > 0 ? 'text-info' : 'text-ink-3'}`}>
            {client.monthlyInterestRate > 0 ? t('summaryCards.ratePerMonth', { rate: client.monthlyInterestRate }) : '—'}
          </p>
        )}
        {canManageInterest && (
          <p className="text-xs text-info mt-0.5">{client.monthlyInterestRate > 0 ? t('summaryCards.graceDays', { days: client.interestGraceDays }) : t('summaryCards.clickToSet')}</p>
        )}
      </div>
      <div className="ui-card">
        <p className="text-xs text-ink-3 uppercase tracking-wide mb-1">{t('summaryCards.transactions')}</p>
        <p className="text-lg font-bold text-ink">
          {transactionCount}
        </p>
      </div>
    </div>
  )
}
