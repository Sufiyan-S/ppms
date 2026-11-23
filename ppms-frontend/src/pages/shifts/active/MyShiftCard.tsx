import { useTranslation } from 'react-i18next'
import type { FuelPrice } from '../../../api/pumpApi'
import type { Shift } from '../../../types/shift'
import { FUEL_UNIT } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { formatCurrency } from '../../../utils/format'
import { formatIstDateTime } from '../../../utils/date'
import { timeOpen } from '../../dashboard/overview/overviewFormat'

interface MyShiftCardProps {
  shift: Shift
  currentPrices: FuelPrice[]
  now: number
}

export function MyShiftCard({ shift, currentPrices, now }: MyShiftCardProps) {
  const { t } = useTranslation('shifts')
  const isOverdue = shift.status === 'OPEN_OVERDUE'
  const fuelTypes = [...new Set(shift.nozzles.map((nozzle) => nozzle.fuelType))]
  const activeCreditEntries = shift.creditEntries.filter((entry) => entry.voidStatus === 'ACTIVE')
  const creditTotal = activeCreditEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const headingId = `my-shift-${shift.id}`

  const priceFor = (fuelType: string): number | null =>
    currentPrices.find((price) => price.fuelType === fuelType)?.pricePerUnit
      ?? shift.fuelReadings.find((reading) => reading.fuelType === fuelType)?.priceSnapshot
      ?? null

  return (
    <section aria-labelledby={headingId} className="ui-card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold text-ink">
            {shift.duName ?? `DU ${shift.duNumber}`}
          </h2>
          <p className="text-sm text-ink-3">
            {t('active.nozzleList', { nozzles: shift.nozzles.map((nozzle) => `#${nozzle.nozzleNumber} ${codeLabel(nozzle.fuelType)}`).join(' · ') })}
          </p>
        </div>
        <span className={`shrink-0 rounded-badge px-2 py-0.5 text-xs font-semibold ${isOverdue ? 'bg-bad-bg text-bad' : 'bg-ok-bg text-ok'}`}>
          {isOverdue ? t('labels.status.overdue') : t('labels.status.open')}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-ink-3">{t('active.startedAt')}</dt>
          <dd className="font-medium text-ink tabular-nums">
            {formatIstDateTime(shift.actualStartTime, { hour: '2-digit', minute: '2-digit', hour12: true })}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">{t('active.timeOnShift')}</dt>
          <dd className="font-medium text-ink tabular-nums">{timeOpen(shift.actualStartTime, now)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">{t('active.creditEntries')}</dt>
          <dd className="font-medium text-ink tabular-nums">{activeCreditEntries.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">{t('active.creditSoFar')}</dt>
          <dd className="font-medium text-ink tabular-nums">{formatCurrency(creditTotal)}</dd>
        </div>
      </dl>

      <div>
        <h3 className="text-xs text-ink-3">{t('active.prices')}</h3>
        <ul className="mt-1 flex flex-wrap gap-2">
          {fuelTypes.map((fuelType) => {
            const price = priceFor(fuelType)
            return (
              <li key={fuelType} className="rounded-control bg-surface-sunken px-3 py-1.5 text-sm text-ink">
                {codeLabel(fuelType)}{' '}
                <span className="font-semibold tabular-nums">
                  {price != null ? `${formatCurrency(price)}/${FUEL_UNIT[fuelType] ?? 'L'}` : t('active.priceNotSet')}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
