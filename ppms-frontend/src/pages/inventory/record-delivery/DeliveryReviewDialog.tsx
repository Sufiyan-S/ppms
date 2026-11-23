import { useTranslation } from 'react-i18next'
import { codeLabel } from '../../../constants/labels'
import { Modal } from '../../../components/Modal'
import { LoadingButton } from '../../../components/LoadingButton'
import { formatNumberIn } from '../../../i18n/format'
import { LitresText, MoneyText } from '../../../components/AmountText'
import { StatusBadge } from '../../../components/StatusBadge'
import { formatCurrency } from '../../../utils/format'
import { fmtDate } from '../inventoryFormat'
import type { PreparedDeliveryItem } from './deliveryRows'

interface Props {
  items: PreparedDeliveryItem[]
  date: string
  invoice: string
  error: string | null
  isOwnerOrAdmin: boolean
  canSetBillTotal: boolean
  billTotalManual: boolean
  billTotalNum: number
  otherCharges: number
  isPending: boolean
  onBack: () => void
  onConfirm: () => void
}

function SummaryFigure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface-sunken px-4 py-3">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-ink">{children}</dd>
    </div>
  )
}

export function DeliveryReviewDialog({
  items, date, invoice, error, isOwnerOrAdmin, canSetBillTotal, billTotalManual, billTotalNum, otherCharges,
  isPending, onBack, onConfirm,
}: Props) {
  const { t } = useTranslation(['inventory', 'common'])
  const totalQty = items.reduce((sum, item) => sum + item.quantityDelivered, 0)
  const calcTotal = items.reduce((sum, item) => sum + item.totalCost, 0)
  const showBill = canSetBillTotal && billTotalNum > 0
  const columns = isOwnerOrAdmin
    ? 'grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)]'
    : 'grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1fr)]'

  return (
    <Modal
      title={t('review.title')}
      subtitle={t('review.subtitle', { invoice: invoice.trim(), date: fmtDate(date) })}
      tone="info"
      size="lg"
      onClose={onBack}
      canClose={!isPending}
      closeOnBackdropClick
      fullScreenOnPhone
      bodyClassName="space-y-5"
      footerClassName="ui-modal-footer--large"
      footer={<>
        <button type="button" onClick={onBack} disabled={isPending} className="ui-btn ui-btn-secondary">
          {t('common:actions.edit')}
        </button>
        <LoadingButton type="button" onClick={onConfirm} isLoading={isPending} loadingLabel={t('review.recording')}
          className="ui-btn-primary">
          {t('review.confirm', { count: items.length })}
        </LoadingButton>
      </>}
    >
      {error && (
        <p role="alert" className="ui-alert ui-alert-danger">
          {t('common:notices.goBackRetry', { error })}
        </p>
      )}

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryFigure label={t('review.tanks')}>{t('deliveries.tankCount', { count: items.length })}</SummaryFigure>
        <SummaryFigure label={t('review.totalQuantity')}><LitresText value={totalQty} decimals={1} /></SummaryFigure>
        {showBill ? (
          <SummaryFigure label={t('review.billAmount')}>
            <MoneyText value={billTotalNum} />
            {isOwnerOrAdmin && billTotalManual && otherCharges !== 0 && (
              <span className="mt-1 block text-xs font-normal text-ink-3">
                {t('review.calculated', { amount: formatNumberIn(calcTotal, { minimumFractionDigits: 2 }) })}
                {' · '}
                {t('review.otherCharges', { amount: `${otherCharges > 0 ? '+' : '−'}${formatCurrency(Math.abs(otherCharges))}` })}
              </span>
            )}
          </SummaryFigure>
        ) : isOwnerOrAdmin && (
          <SummaryFigure label={t('review.calculatedTotal')}><MoneyText value={calcTotal} /></SummaryFigure>
        )}
      </dl>

      <div className="ui-card p-0 overflow-hidden">
        <div className={`grid gap-3 bg-surface-sunken px-4 py-3 text-xs font-semibold text-ink-3 ${columns}`}>
          <span>{t('columns.tank')}</span>
          <span>{t('columns.fuel')}</span>
          <span className="text-right">{t('columns.quantity')}</span>
          {isOwnerOrAdmin && <span className="text-right">{t('columns.rate')}</span>}
          {isOwnerOrAdmin && <span className="text-right">{t('columns.amount')}</span>}
        </div>
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item.tankId} className="px-4 py-3">
              <div className={`grid gap-3 items-center text-sm ${columns}`}>
                <span className="font-semibold text-ink">{item.tankIdentifier}</span>
                <StatusBadge tone="neutral" label={codeLabel(item.fuelType)} className="w-fit" />
                <LitresText value={item.quantityDelivered} className="text-right text-ink-2" />
                {isOwnerOrAdmin && (
                  <span className="text-right text-ink-3 tabular-nums">
                    ₹{item.costPricePerUnit.toFixed(4)}/L
                  </span>
                )}
                {isOwnerOrAdmin && (
                  <MoneyText value={item.totalCost} className="text-right font-semibold text-ink" />
                )}
              </div>
              {item.stockAfter !== null && (
                <p className="mt-2 text-xs text-ink-3">
                  {t('review.stockAfterDelivery')} <span className="font-medium text-ink tabular-nums">
                    {formatNumberIn(item.stockAfter, { minimumFractionDigits: 1 })} L
                  </span>
                  {item.capacity !== null && <>{' '}{t('review.ofCapacity', { capacity: formatNumberIn(item.capacity, { minimumFractionDigits: 0 }) })}</>}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
