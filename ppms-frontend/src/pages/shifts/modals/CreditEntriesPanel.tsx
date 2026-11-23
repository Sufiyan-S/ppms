import { useTranslation } from 'react-i18next'
import { codeLabel } from '../../../constants/labels'
import type { Shift, CreditEntry } from '../../../types/shift'
import { SidePanel } from '../../../components/layout/SidePanel'
import { StatusBadge } from '../../../components/StatusBadge'
import { MoneyText } from '../../../components/AmountText'

/** The credit sales recorded on one closed shift, read-only. */
export function CreditEntriesPanel({
  shift,
  entries,
  creditTotal,
  onClose,
}: {
  shift: Shift
  entries: CreditEntry[]
  creditTotal: number
  onClose: () => void
}) {
  const { t } = useTranslation('shifts')
  return (
    <tr>
      <td colSpan={8} className="p-0">
        <SidePanel
          title={t('creditEntries.title')}
          subtitle={t('creditEntries.subtitle', { id: shift.id, nozzles: shift.nozzles.map((n) => `#${n.nozzleNumber}`).join(', '), operator: shift.operatorName, date: shift.shiftDate })}
          onClose={onClose}
          bodyClassName="p-0 divide-y divide-border"
          footerClassName="justify-between"
          footer={
            <>
              <span className="text-sm font-semibold text-ink">{t('creditEntries.total')}</span>
              <MoneyText value={creditTotal} className="text-base font-bold text-ink" />
            </>
          }
        >
          {entries.map((entry, idx) => (
            <div key={entry.id} className="flex items-start gap-3 px-5 py-3.5">
              <div className="w-7 h-7 rounded-full bg-surface-sunken text-ink-2 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {idx + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-ink">{entry.clientName}</p>
                  {entry.fuelType && <StatusBadge tone="neutral" label={codeLabel(entry.fuelType)} />}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                  {entry.billNo ? (
                    <span className="text-xs text-ink-3">
                      {t('creditEntries.bill')} <span className="font-mono bg-surface-sunken px-1 py-0.5 rounded-control text-ink-2">{entry.billNo}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-ink-3">{t('creditEntries.noBill')}</span>
                  )}
                  {entry.description && (
                    <span className="text-xs text-ink-3 italic">"{entry.description}"</span>
                  )}
                </div>
              </div>

              <MoneyText value={entry.amount} className="text-sm font-semibold text-ink shrink-0" />
            </div>
          ))}
        </SidePanel>
      </td>
    </tr>
  )
}
