import { useEffect } from 'react'
import { codeLabel } from '../../../constants/labels'
import { Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FuelReading, Shift } from '../../../types/shift'
import { formatIstDateTime } from '../../../utils/date'
import { SidePanel } from '../../../components/layout/SidePanel'
import { DataTable } from '../../../components/DataTable'
import type { DataTableColumn } from '../../../components/DataTable'
import { LitresText, MoneyText } from '../../../components/AmountText'
import { DiscrepancyBadge } from '../components/DiscrepancyBadge'
import { printWhenFontsReady } from '../../../i18n/fonts'

export function HandoverReportPanel({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const { t } = useTranslation(['shifts', 'common'])
  const readingColumns: DataTableColumn<FuelReading>[] = [
    {
      key: 'nozzle',
      header: t('handover.report.columns.nozzle'),
      cell: (r) => {
        const nozzle = shift.nozzles.find(n => n.id === r.nozzleId)
        return <span className="font-medium">{nozzle ? `#${nozzle.nozzleNumber} ${codeLabel(r.fuelType)}` : codeLabel(r.fuelType)}</span>
      },
    },
    { key: 'opening', header: t('handover.report.columns.opening'), numeric: true, cell: (r) => r.startReading ?? '—' },
    { key: 'closing', header: t('handover.report.columns.closing'), numeric: true, cell: (r) => r.endReading ?? '—' },
    { key: 'sold', header: t('handover.report.columns.litresSold'), numeric: true, cell: (r) => <LitresText value={r.unitsSold} className="font-semibold" /> },
    { key: 'rate', header: t('handover.report.columns.rate'), numeric: true, cell: (r) => <MoneyText value={r.priceSnapshot} className="text-ink-3" /> },
  ]

  // Tag <body> while this panel is open so @media print can isolate it:
  // hide #root and free the panel from its max-height/overflow constraints.
  useEffect(() => {
    document.body.classList.add('handover-printing')
    return () => document.body.classList.remove('handover-printing')
  }, [])

  return (
    <SidePanel
      title={t('handover.report.title')}
      subtitle={
        <>
          {t('handover.report.subtitle', { id: shift.id, operator: shift.operatorName, date: shift.shiftDate })}
          {' · '}
          {formatIstDateTime(shift.actualStartTime, { hour: '2-digit', minute: '2-digit' })}
          {' → '}
          {shift.actualEndTime
            ? formatIstDateTime(shift.actualEndTime, { hour: '2-digit', minute: '2-digit' })
            : t('handover.report.stillOpen')}
        </>
      }
      headerActions={
        <button type="button" onClick={() => void printWhenFontsReady()} className="ui-btn ui-btn-secondary ui-btn-compact inline-flex items-center gap-1.5 text-xs">
          <Printer size={14} strokeWidth={2} aria-hidden="true" /> {t('handover.report.print')}
        </button>
      }
      size="lg"
      onClose={onClose}
      headerClassName="print:hidden"
      bodyClassName="p-6 space-y-5 text-sm print:overflow-visible"
    >
          {/* Title for print */}
          <div className="hidden print:block text-center mb-4">
            <h2 className="text-xl font-bold">{t('handover.report.title')}</h2>
            <p className="text-ink-3 text-xs mt-1">{t('common:shiftNumber', { id: shift.id })}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t('handover.report.operator'),    value: shift.operatorName },
              { label: t('handover.report.date'),        value: shift.shiftDate },
              { label: t('handover.report.du'),          value: shift.duName ?? t('handover.report.duFallback', { number: shift.duNumber }) },
              { label: t('handover.report.shiftWindow'), value: shift.shiftWindow ?? '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-ink-3 mb-0.5">{label}</p>
                <p className="font-semibold text-ink">{value}</p>
              </div>
            ))}
          </div>

          {shift.fuelReadings && shift.fuelReadings.length > 0 && (
            <DataTable
              caption={t('handover.report.meterReadings')}
              columns={readingColumns}
              rows={shift.fuelReadings}
              rowKey={(r) => r.nozzleId}
              tableClassName="text-xs"
            />
          )}

          <div>
            <h3 className="text-sm font-semibold text-ink mb-2">{t('handover.report.collections')}</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: t('common:paymentMethods.CASH'),      val: shift.cashCollected },
                { label: t('common:paymentMethods.UPI'),       val: shift.upiCollected },
                { label: t('common:paymentMethods.CARD'),      val: shift.cardCollected },
                { label: t('common:paymentMethods.FLEET_CARD'), val: shift.fleetCardCollected },
                { label: t('common:paymentMethods.CREDIT'),    val: shift.creditTotal },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between bg-surface-sunken rounded-control px-3 py-2">
                  <span className="text-ink-3">{label}</span>
                  <MoneyText value={val} className="font-semibold text-ink" />
                </div>
              ))}
              <div className="flex justify-between bg-surface-sunken rounded-control px-3 py-2 col-span-2">
                <span className="font-semibold text-ink">{t('handover.report.totalDue')}</span>
                <MoneyText value={shift.totalAmountDue} className="font-bold text-ink" />
              </div>
            </div>
          </div>

          {shift.discrepancyAmount != null && (
            <div className="rounded-card border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">{t('handover.report.discrepancy')}</h3>
                <DiscrepancyBadge type={shift.discrepancyType} amount={shift.discrepancyAmount} />
              </div>
              {shift.discrepancyReason && (
                <p className="text-xs text-ink-3 mt-1">{t('handover.report.reason', { reason: shift.discrepancyReason })}</p>
              )}
            </div>
          )}

          <div className="hidden print:grid grid-cols-2 gap-10 pt-8">
            <div>
              <div className="border-b border-control mb-1" />
              <p className="text-xs text-ink-3">{t('handover.report.operatorSignature')}</p>
            </div>
            <div>
              <div className="border-b border-control mb-1" />
              <p className="text-xs text-ink-3">{t('handover.report.supervisorSignature')}</p>
            </div>
          </div>
    </SidePanel>
  )
}
