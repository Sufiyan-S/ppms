import type { ReactNode } from 'react'
import { AlertTriangle, Ban, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Settlement } from '../../api/paymentSettlementApi'
import { SidePanel } from '../../components/layout/SidePanel'
import { MoneyText } from '../../components/AmountText'
import { StatusBadge } from '../../components/StatusBadge'
import { formatIstDateTime } from '../../utils/date'
import { fmtAmt, fmtDate, typeLabel } from './settlementFormat'

interface SettlementDetailsPanelProps {
  settlement: Settlement
  canVoid: boolean
  onVoid: (settlement: Settlement) => void
  onClose: () => void
}

/** Everything recorded about one bank credit, including the reference and why it was voided. */
export function SettlementDetailsPanel({ settlement, canVoid, onVoid, onClose }: SettlementDetailsPanelProps) {
  const { t } = useTranslation(['settlements', 'common'])
  const isVoided = settlement.voidStatus === 'VOIDED'
  const shortfall = settlement.isPartial && settlement.pendingAtRecordTime != null
    ? settlement.pendingAtRecordTime - settlement.amountReceived
    : 0

  const rows: [string, ReactNode][] = [
    [t('details.paymentType'), typeLabel(settlement.paymentType)],
    [t('details.amountReceived'), <MoneyText key="amount" value={settlement.amountReceived} />],
    [t('record.date'), fmtDate(settlement.settlementDate)],
    [t('record.bankReference'), settlement.bankReference || '—'],
    [t('common:fields.notes'), settlement.notes || '—'],
    [t('details.recordedBy'), settlement.recordedByUserName],
    [t('details.recordedAt'), formatIstDateTime(settlement.createdAt)],
  ]
  if (settlement.pendingAtRecordTime != null) {
    rows.push([t('details.pendingAtRecord'), <MoneyText key="pending" value={settlement.pendingAtRecordTime} />])
  }
  if (isVoided) {
    rows.push([t('details.voidReason'), settlement.voidReason || '—'])
    if (settlement.voidedAt) rows.push([t('details.voidedAt'), formatIstDateTime(settlement.voidedAt)])
  }

  return (
    <SidePanel
      title={t('details.title')}
      subtitle={`${typeLabel(settlement.paymentType)} · ${fmtAmt(settlement.amountReceived)}`}
      onClose={onClose}
      bodyClassName="space-y-4 text-sm"
      footer={canVoid && !isVoided && (
        <button type="button" onClick={() => onVoid(settlement)} className="ui-btn ui-btn-danger">
          {t('history.void')}
        </button>
      )}
    >
      <div>
        {isVoided ? (
          <StatusBadge tone="bad" icon={Ban} label={t('history.voided')} />
        ) : settlement.isPartial ? (
          <StatusBadge tone="warn" icon={AlertTriangle} label={t('history.partialShort', { amount: fmtAmt(shortfall) })} />
        ) : (
          <StatusBadge tone="ok" icon={CheckCircle2} label={t('details.counted')} />
        )}
      </div>
      <dl className="divide-y divide-border rounded-card border border-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 px-3 py-2">
            <dt className="text-ink-2">{label}</dt>
            <dd className="text-right font-semibold text-ink break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </SidePanel>
  )
}
