import { useId, useState } from 'react'
import { ChevronDown, ChevronUp, CircleCheck, CircleDashed } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../../components/AmountText'
import { DiscrepancyBadge } from '../components/DiscrepancyBadge'
import { fmt } from '../components/creditRow'
import { discrepancyTypeOf, formatUnits } from './closeShiftTotals'
import type { PaymentSplit } from './CloseShiftReview'

export interface SoldUnits {
  unit: string
  amount: number
}

export interface LiveSummaryFigures {
  /** One total per fuel unit (L, kg); empty until an end reading is entered. */
  sold: SoldUnits[]
  /** null until there is something to show, so the panel reads "—" rather than ₹0.00. */
  totalDue: number | null
  payments: PaymentSplit | null
  totalCollected: number | null
  diff: number | null
  /** The approval limit the difference is above, when it is. */
  approvalLimit: number | null
}

interface Props {
  figures: LiveSummaryFigures
  stillNeeded: string[]
  /** Given to the list of missing items so the Review button can point to it. */
  stillNeededId: string
}

function StillNeeded({ items, id }: { items: string[]; id: string }) {
  const { t } = useTranslation(['shifts', 'common'])
  if (items.length === 0) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs font-medium text-ok">
        <CircleCheck size={14} aria-hidden="true" />{t('close.stillNeeded.ready')}
      </p>
    )
  }
  return (
    <div id={id}>
      <p className="text-xs font-semibold text-ink-2">{t('close.stillNeeded.title')}</p>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-1.5 text-xs text-ink-2">
            <CircleDashed size={14} aria-hidden="true" className="mt-px shrink-0 text-ink-3" />{item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Difference({ diff }: { diff: number | null }) {
  if (diff === null) return <span className="text-ink-3">—</span>
  return <DiscrepancyBadge type={discrepancyTypeOf(diff)} amount={Math.abs(diff)} />
}

function Breakdown({ figures }: { figures: LiveSummaryFigures }) {
  const { t } = useTranslation(['shifts', 'common'])
  const { payments } = figures
  const paymentLines: Array<[string, number]> = payments ? [
    [t('common:paymentMethods.CASH'), payments.cash],
    [t('common:paymentMethods.UPI'), payments.upi],
    [t('common:paymentMethods.CARD'), payments.card],
    [t('close.review.fleetCard'), payments.fleetCard],
    [t('close.liveSummary.credit'), payments.credit],
  ] : []
  const shownPayments = paymentLines.filter(([, amount]) => amount > 0)

  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-ink-2">{t('close.liveSummary.sold')}</dt>
        <dd className="text-right tabular-nums">
          {figures.sold.length > 0 ? figures.sold.map((s) => formatUnits(s.amount, s.unit)).join(' · ') : <span className="text-ink-3">—</span>}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-ink-2">{t('close.liveSummary.totalDue')}</dt>
        <dd><MoneyText value={figures.totalDue} className="font-semibold" /></dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-ink-2">{t('close.liveSummary.collected')}</dt>
        <dd><MoneyText value={figures.totalCollected} className="font-semibold" /></dd>
      </div>
      {shownPayments.map(([label, amount]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 pl-3 text-xs">
          <dt className="text-ink-3">{label}</dt>
          <dd className="text-ink-2"><MoneyText value={amount} /></dd>
        </div>
      ))}
    </dl>
  )
}

function ApprovalNote({ limit }: { limit: number | null }) {
  const { t } = useTranslation(['shifts', 'common'])
  if (limit === null) return null
  return <p className="ui-alert ui-alert-warning px-3 py-2 text-xs">{t('close.review.needsApproval', { limit: fmt(limit) })}</p>
}

/** The live result beside the form on wide screens: sales, money in, the difference and what is still missing. */
export function CloseShiftSummaryPanel({ figures, stillNeeded, stillNeededId }: Props) {
  const { t } = useTranslation(['shifts', 'common'])
  const headingId = useId()
  return (
    <aside aria-labelledby={headingId} className="ui-close-summary">
      <h3 id={headingId} className="text-sm font-semibold text-ink">{t('close.liveSummary.title')}</h3>
      <Breakdown figures={figures} />
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
        <span className="text-ink-2">{t('close.liveSummary.difference')}</span>
        <Difference diff={figures.diff} />
      </div>
      <ApprovalNote limit={figures.approvalLimit} />
      <StillNeeded items={stillNeeded} id={stillNeededId} />
    </aside>
  )
}

/** The same summary as a compact bar above the buttons on narrow screens; the breakdown opens on request. */
export function CloseShiftSummaryBar({ figures, stillNeeded, stillNeededId }: Props) {
  const { t } = useTranslation(['shifts', 'common'])
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  return (
    <section aria-label={t('close.liveSummary.title')} className="ui-close-summary-bar">
      <div className="flex items-center gap-x-3 gap-y-1">
        <dl className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <div className="flex items-baseline gap-1">
            <dt className="text-ink-3">{t('close.liveSummary.due')}</dt>
            <dd><MoneyText value={figures.totalDue} className="font-semibold" /></dd>
          </div>
          <div className="flex items-baseline gap-1">
            <dt className="text-ink-3">{t('close.liveSummary.collected')}</dt>
            <dd><MoneyText value={figures.totalCollected} className="font-semibold" /></dd>
          </div>
          {figures.diff !== null && (
            <div>
              <dt className="sr-only">{t('close.liveSummary.difference')}</dt>
              <dd><Difference diff={figures.diff} /></dd>
            </div>
          )}
        </dl>
        <button type="button" aria-expanded={expanded} aria-controls={detailsId}
          onClick={() => setExpanded((open) => !open)}
          className="ui-btn ui-btn-ghost ui-btn-compact shrink-0 gap-1">
          {expanded ? t('close.liveSummary.hideDetails') : t('close.liveSummary.showDetails')}
          {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronUp size={14} aria-hidden="true" />}
        </button>
      </div>
      <div id={detailsId} hidden={!expanded} className="ui-close-summary-bar__details">
        <Breakdown figures={figures} />
        <ApprovalNote limit={figures.approvalLimit} />
      </div>
      {stillNeeded.length > 0 && <StillNeeded items={stillNeeded} id={stillNeededId} />}
    </section>
  )
}
