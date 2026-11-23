import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { LoadingButton } from '../../../components/LoadingButton'
import { DataTable } from '../../../components/DataTable'
import type { DataTableColumn } from '../../../components/DataTable'
import { MoneyText } from '../../../components/AmountText'
import { DiscrepancyBadge } from '../components/DiscrepancyBadge'
import { fmt } from '../components/creditRow'
import { discrepancyTypeOf, needsOwnerApproval } from './closeShiftTotals'

export interface NozzleSaleLine {
  nozzleId: number
  label: string
  units: number
  unit: string
  amount: number
}

export interface PaymentSplit {
  cash: number
  upi: number
  card: number
  fleetCard: number
  credit: number
}

interface Props {
  isHandover: boolean
  incomingOperatorName: string | null
  lines: NozzleSaleLine[]
  totalDue: number
  payments: PaymentSplit
  creditEntryCount: number
  totalCollected: number
  diff: number
  discrepancyReason: string
  escalationThreshold: number | null
  serverError: string | null
}

function saleColumns(t: TFunction<['shifts', 'common']>): DataTableColumn<NozzleSaleLine>[] {
  return [
    { key: 'nozzle', header: t('close.review.columns.nozzle'), cell: (line) => line.label },
    { key: 'sold', header: t('close.review.columns.sold'), numeric: true, cell: (line) => `${line.units.toFixed(3)} ${line.unit}` },
    { key: 'amount', header: t('close.review.columns.amount'), numeric: true, cell: (line) => <MoneyText value={line.amount} /> },
  ]
}

export function CloseShiftReview({
  isHandover, incomingOperatorName, lines, totalDue, payments, creditEntryCount, totalCollected, diff,
  discrepancyReason, escalationThreshold, serverError,
}: Props) {
  const { t } = useTranslation(['shifts', 'common'])
  const discrepancyType = discrepancyTypeOf(diff)
  const paymentRows: Array<[string, number]> = [
    [t('common:paymentMethods.CASH'), payments.cash],
    [t('common:paymentMethods.UPI'), payments.upi],
    [t('common:paymentMethods.CARD'), payments.card],
    [t('close.review.fleetCard'), payments.fleetCard],
    [t('close.review.credit', { count: creditEntryCount }), payments.credit],
  ]

  return (
    <>
      <p className="text-ink-2">
        {isHandover ? t('close.review.introHandover') : t('close.review.introClose')}
      </p>

      {isHandover && (
        <div className="flex items-center justify-between rounded-card border border-border px-3 py-2">
          <span className="text-ink-2">{t('close.review.incomingOperator')}</span>
          <span className="font-semibold">{incomingOperatorName ?? '—'}</span>
        </div>
      )}

      <section aria-labelledby="review-sales-heading">
        <h3 id="review-sales-heading" className="mb-2 font-semibold">{t('close.review.salesByNozzle')}</h3>
        <DataTable
          caption={t('close.review.salesByNozzle')}
          captionHidden
          columns={saleColumns(t)}
          rows={lines}
          rowKey={(line) => line.nozzleId}
          footer={(
            <tr>
              <th scope="row" colSpan={2} className="text-left font-semibold">{t('close.review.totalDue')}</th>
              <td className="text-right text-base font-bold"><MoneyText value={totalDue} /></td>
            </tr>
          )}
        />
      </section>

      <section aria-labelledby="review-collected-heading">
        <h3 id="review-collected-heading" className="mb-2 font-semibold">{t('close.review.collected')}</h3>
        <dl className="divide-y divide-border rounded-card border border-border">
          {paymentRows.map(([label, amount]) => (
            <div key={label} className="flex justify-between px-3 py-2">
              <dt className="text-ink-2">{label}</dt>
              <dd><MoneyText value={amount} /></dd>
            </div>
          ))}
          <div className="flex justify-between bg-surface-sunken px-3 py-2 font-semibold">
            <dt>{t('close.review.totalCollected')}</dt>
            <dd><MoneyText value={totalCollected} /></dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="review-result-heading" className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 id="review-result-heading" className="font-semibold">{t('close.review.result')}</h3>
          <DiscrepancyBadge type={discrepancyType} amount={Math.abs(diff)} />
        </div>
        {discrepancyType && discrepancyReason.trim() && (
          <p className="text-ink-2">{t('close.review.reason', { reason: discrepancyReason.trim() })}</p>
        )}
        {discrepancyType && needsOwnerApproval(diff, escalationThreshold) && (
          <p className="ui-alert ui-alert-warning">
            {t('close.review.needsApproval', { limit: fmt(escalationThreshold ?? 0) })}
          </p>
        )}
      </section>

      {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
    </>
  )
}

interface ActionsProps {
  isHandover: boolean
  isSubmitting: boolean
  onConfirm: () => void
  onEdit: () => void
}

export function CloseShiftReviewActions({ isHandover, isSubmitting, onConfirm, onEdit }: ActionsProps) {
  const { t } = useTranslation(['shifts', 'common'])
  return (
    <>
      <button type="button" onClick={onEdit} disabled={isSubmitting} className="ui-btn ui-btn-secondary flex-1">
        {t('common:actions.edit')}
      </button>
      <LoadingButton type="button" onClick={onConfirm} isLoading={isSubmitting}
        loadingLabel={isHandover ? t('close.review.handingOver') : t('close.review.closing')}
        className="ui-btn-primary flex-1">
        {isHandover ? t('close.review.confirmHandover') : t('close.review.confirmClose')}
      </LoadingButton>
    </>
  )
}
