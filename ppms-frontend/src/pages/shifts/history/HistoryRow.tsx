import { useState } from 'react'
import type { ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { History, Printer, ReceiptText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../../store/authStore'
import type { Shift } from '../../../types/shift'
import { IconButton } from '../../../components/IconButton'
import { CreditEntriesPanel } from '../modals/CreditEntriesPanel'
import { HandoverReportPanel } from '../modals/HandoverReportPanel'
import { ResolveDiscrepancyModal } from '../modals/ResolveDiscrepancyModal'
import { awaitingOwnerApprovalLabel, discrepancyAction, fmtAmt, investigationLabel } from '../shiftLabels'
import { StatusBadge } from '../../../components/StatusBadge'
import { shiftStatusBadge } from '../../../components/statusBadges'
import { MoneyText } from '../../../components/AmountText'
import { codeLabel } from '../../../constants/labels'
import { formatIstDateTime } from '../../../utils/date'
import { DiscrepancyBadge } from '../components/DiscrepancyBadge'

const TIME = { hour: '2-digit', minute: '2-digit' } as const

function duLabel(shift: Shift, t: TFunction<['shifts', 'common']>): string {
  if (shift.duName == null) return t('handover.report.duFallback', { number: shift.duNumber })
  // Names such as "DU 1" already carry the prefix; bare names such as "A" get it.
  return /^DU\b/i.test(shift.duName) ? shift.duName : t('history.duName', { name: shift.duName })
}

function DuAndNozzles({ shift, wrap = false }: { shift: Shift; wrap?: boolean }) {
  const { t } = useTranslation(['shifts', 'common'])
  return (
    <span className={wrap ? '' : 'whitespace-nowrap'}>
      <span className="text-xs text-ink-3">{duLabel(shift, t)}</span> · <span className="rounded-control bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-ink">
        {shift.nozzles.map((n) => `#${n.nozzleNumber} ${codeLabel(n.fuelType)}`).join(', ')}
      </span>
    </span>
  )
}

/** Open/close state of the credit, resolve and handover panels a shift can show, and the panels themselves. */
function useShiftPanels(shift: Shift) {
  const [creditOpen,   setCreditOpen]   = useState(false)
  const [resolveOpen,  setResolveOpen]  = useState(false)
  const [handoverOpen, setHandoverOpen] = useState(false)
  const hasCreditEntries = (shift.creditEntries?.length ?? 0) > 0

  const panels = (
    <>
      {creditOpen && hasCreditEntries && (
        <CreditEntriesPanel
          shift={shift}
          entries={shift.creditEntries}
          creditTotal={shift.creditTotal ?? 0}
          onClose={() => setCreditOpen(false)}
        />
      )}
      {resolveOpen && <ResolveDiscrepancyModal shift={shift} onClose={() => setResolveOpen(false)} />}
      {handoverOpen && <HandoverReportPanel shift={shift} onClose={() => setHandoverOpen(false)} />}
    </>
  )

  return {
    openCredit:   () => setCreditOpen(true),
    openResolve:  () => setResolveOpen(true),
    openHandover: () => setHandoverOpen(true),
    panels,
  }
}

function PaymentItem({ dotClass, label, stacked, children }: {
  dotClass: string; label: string; stacked: boolean; children: ReactNode
}) {
  return (
    <div className={stacked ? 'flex items-start justify-between gap-3' : 'flex items-baseline gap-1.5'}>
      <dt className="flex shrink-0 items-center gap-1.5 text-ink-3">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
        {label}
      </dt>
      <dd className="m-0 flex min-w-0 flex-wrap items-baseline justify-end gap-1 text-right tabular-nums">{children}</dd>
    </div>
  )
}

/**
 * Cash, UPI + Card and Credit collected by a closed shift.
 * A strip of label/amount pairs aligned right under a table row, or one pair per line on a phone card.
 */
function PaymentBreakdown({ shift, stacked, onOpenCredit }: { shift: Shift; stacked: boolean; onOpenCredit: () => void }) {
  const { t } = useTranslation(['shifts', 'common'])
  const digitalTotal     = (shift.upiCollected ?? 0) + (shift.cardCollected ?? 0)
  const creditAmt        = shift.creditTotal ?? 0
  const hasCreditEntries = (shift.creditEntries?.length ?? 0) > 0

  return (
    <dl
      data-testid="payment-breakdown"
      className={stacked ? 'space-y-1 text-xs' : 'flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 text-xs'}
    >
      <PaymentItem dotClass="bg-ok" label={t('common:paymentMethods.CASH')} stacked={stacked}>
        <MoneyText value={shift.cashCollected} className="font-semibold text-ink" />
      </PaymentItem>

      <PaymentItem dotClass="bg-info" label={t('history.payment.upiCard')} stacked={stacked}>
        {(shift.upiCollected ?? 0) > 0 && (
          <span className="rounded-control bg-info-bg px-1.5 py-0.5 text-ink-3">
            {t('history.payment.upiAmount', { amount: fmtAmt(shift.upiCollected) })}
          </span>
        )}
        {(shift.cardCollected ?? 0) > 0 && (
          <span className="rounded-control bg-info-bg px-1.5 py-0.5 text-ink-3">
            {t('history.payment.cardAmount', { amount: fmtAmt(shift.cardCollected) })}
          </span>
        )}
        <MoneyText value={digitalTotal > 0 ? digitalTotal : null} className="font-semibold text-ink" />
      </PaymentItem>

      <PaymentItem dotClass="bg-warn" label={t('common:paymentMethods.CREDIT')} stacked={stacked}>
        {creditAmt <= 0 ? (
          <span className="text-ink-3">—</span>
        ) : hasCreditEntries && !stacked ? (
          <button
            type="button"
            onClick={onOpenCredit}
            className="flex items-center gap-1.5 rounded-control bg-warn-bg px-2 py-0.5 font-semibold text-warn transition-colors hover:text-warn-strong"
            title={t('history.payment.viewCredit')}
          >
            {fmtAmt(creditAmt)}
            <span className="text-xs text-warn">
              · {t('history.payment.clientCount', { count: shift.creditEntries.length })} ↗
            </span>
          </button>
        ) : (
          <>
            {hasCreditEntries && (
              <span className="text-ink-3">{t('history.payment.clientCount', { count: shift.creditEntries.length })}</span>
            )}
            <MoneyText value={creditAmt} className="font-semibold text-warn" />
          </>
        )}
      </PaymentItem>
    </dl>
  )
}

function DiscrepancyNotes({ shift }: { shift: Shift }) {
  const { user } = useAuthStore()
  const investigation = investigationLabel(shift)
  return (
    <>
      {discrepancyAction(shift, user?.role) === 'awaiting-owner' && (
        <span className="text-xs font-medium text-warn">{awaitingOwnerApprovalLabel()}</span>
      )}
      {shift.discrepancyResolution && (
        <span className="text-xs text-ink-3">{codeLabel(shift.discrepancyResolution)}</span>
      )}
      {investigation && (
        <span className="text-xs text-warn" title={shift.investigationNote ?? undefined}>{investigation}</span>
      )}
    </>
  )
}

function ResolveButton({ shift, onOpen, className }: { shift: Shift; onOpen: () => void; className: string }) {
  const { t } = useTranslation(['shifts', 'common'])
  const { user } = useAuthStore()
  const action = discrepancyAction(shift, user?.role)
  if (action === 'resolve') {
    return <button type="button" onClick={onOpen} className={`ui-btn ui-btn-danger ${className}`}>{t('history.resolve')}</button>
  }
  if (action === 'approve') {
    return <button type="button" onClick={onOpen} className={`ui-btn ui-btn-warning ${className}`}>{t('common:actions.approve')}</button>
  }
  return null
}

// ── History row ───────────────────────────────────────────────────────────────
// Payment breakdown is always visible for closed shifts.
// Credit amount is clickable — opens a popup modal listing all client credit entries.

export function HistoryRow({ shift }: { shift: Shift }) {
  const { t } = useTranslation(['shifts', 'common'])
  const { openCredit, openResolve, openHandover, panels } = useShiftPanels(shift)
  const isClosed = shift.totalAmountDue != null

  return (
    <>
      <tr>
        <td className="px-5 py-3 text-ink-3 text-xs font-mono hidden md:table-cell">{shift.id}</td>
        <td className="px-5 py-3">
          <DuAndNozzles shift={shift} />
        </td>
        <td className="px-5 py-3 hidden md:table-cell">
          {shift.shiftWindow ? (
            <StatusBadge tone="info" label={shift.shiftWindow} />
          ) : (
            <span className="text-xs text-ink-3">—</span>
          )}
        </td>
        <td className="px-5 py-3 text-sm text-ink font-medium">{shift.operatorName}</td>
        <td className="px-5 py-3 text-xs text-ink-3">{shift.shiftDate}</td>
        <td className="px-5 py-3 text-right text-sm font-semibold text-ink tabular-nums">
          <MoneyText value={shift.totalAmountDue} />
        </td>
        <td className="px-5 py-3">
          <div className="flex flex-wrap items-center gap-1">
            <StatusBadge {...shiftStatusBadge(shift.status)} />
            {shift.isBackfilled && <StatusBadge tone="neutral" icon={History} label={t('history.backfilled')} />}
          </div>
        </td>
        <td className="px-5 py-3 text-right hidden md:table-cell">
          {shift.discrepancyAmount != null ? (
            <span className={`whitespace-nowrap text-xs font-semibold tabular-nums ${
              shift.discrepancyType === 'SHORT' ? 'text-bad' : 'text-warn'
            }`}>
              {shift.discrepancyType === 'SHORT' ? t('common:badges.short') : shift.discrepancyType === 'OVER' ? t('common:badges.over') : shift.discrepancyType} {fmtAmt(shift.discrepancyAmount)}
            </span>
          ) : (
            <span className="text-xs text-ink-3">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <ResolveButton shift={shift} onOpen={openResolve} className="min-h-0 px-3 py-1.5 text-xs" />
            <DiscrepancyNotes shift={shift} />
            {isClosed && (
              <IconButton
                onClick={openHandover}
                className="text-ink-3 hover:text-ink-2 transition-colors"
                label={t('history.printHandover')}
                icon={<Printer size={14} strokeWidth={2} />}
              />
            )}
          </div>
        </td>
      </tr>

      {/* ── Payment breakdown row — always visible for closed shifts ──────── */}
      {isClosed && (
        <tr className="bg-surface-sunken">
          <td colSpan={9} className="p-0">
            {/* Stays inside the visible width while the table scrolls sideways; the table region is the size container. */}
            <div className="sticky left-0 max-w-[100cqw] px-5 pb-3 pt-1">
              <PaymentBreakdown shift={shift} stacked={false} onOpenCredit={openCredit} />
            </div>
          </td>
        </tr>
      )}

      {panels}
    </>
  )
}

// ── History card (phones) ─────────────────────────────────────────────────────

export function HistoryCard({ shift }: { shift: Shift }) {
  const { t } = useTranslation(['shifts', 'common'])
  const { openCredit, openResolve, openHandover, panels } = useShiftPanels(shift)
  const isClosed         = shift.totalAmountDue != null
  const hasCreditEntries = (shift.creditEntries?.length ?? 0) > 0
  const start = formatIstDateTime(shift.actualStartTime, TIME)
  const end   = shift.actualEndTime ? formatIstDateTime(shift.actualEndTime, TIME) : t('handover.report.stillOpen')

  return (
    <li data-testid="history-card" className="space-y-2 bg-surface px-4 py-(--density-row-y)">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-ink">
          <span className="font-mono">#{shift.id}</span> · <DuAndNozzles shift={shift} wrap />
        </p>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <StatusBadge {...shiftStatusBadge(shift.status)} />
          {shift.isBackfilled && <StatusBadge tone="neutral" icon={History} label={t('history.backfilled')} />}
        </div>
      </div>

      <p className="text-xs text-ink-3">
        <span className="font-medium text-ink-2">{shift.operatorName}</span>
        {shift.shiftWindow && <> · {shift.shiftWindow}</>}
        {' · '}<span className="tabular-nums">{start}–{end}</span>
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-3">{t('history.columns.amountDue')}</span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {shift.discrepancyType && (
            <DiscrepancyBadge type={shift.discrepancyType} amount={shift.discrepancyAmount ?? 0} />
          )}
          <MoneyText value={shift.totalAmountDue} className="text-sm font-semibold text-ink" />
        </span>
      </div>

      {isClosed && (
        <div className="rounded-control bg-surface-sunken px-3 py-2">
          <PaymentBreakdown shift={shift} stacked onOpenCredit={openCredit} />
        </div>
      )}

      <div className="flex flex-col items-end gap-1 empty:hidden">
        <DiscrepancyNotes shift={shift} />
      </div>

      <div className="flex flex-col gap-2 empty:hidden">
        <ResolveButton shift={shift} onOpen={openResolve} className="w-full" />
        {hasCreditEntries && (
          <button type="button" onClick={openCredit} className="ui-btn ui-btn-secondary w-full">
            <ReceiptText size={16} strokeWidth={2} aria-hidden="true" />
            {t('creditEntries.title')} · {t('history.payment.clientCount', { count: shift.creditEntries.length })}
          </button>
        )}
        {isClosed && (
          <button type="button" onClick={openHandover} className="ui-btn ui-btn-secondary w-full">
            <Printer size={16} strokeWidth={2} aria-hidden="true" />
            {t('history.printHandover')}
          </button>
        )}
      </div>

      {panels}
    </li>
  )
}
