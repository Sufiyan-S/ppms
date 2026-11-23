import { useTranslation } from 'react-i18next'
import { FormField } from '../../../components/FormField'
import { FormGrid } from '../../../components/layout/FormGrid'
import { NumericInput } from '../../../components/NumericInput'
import { FUEL_UNIT } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { formatCurrency } from '../../../utils/format'
import { roundToPaise } from '../../../utils/money'
import { formatUnits } from '../close/closeShiftTotals'
import type { BackfillForm } from './useBackfillForm'

function ReadingResult({ form, nozzleId, unit }: { form: BackfillForm; nozzleId: number; unit: string }) {
  const { t } = useTranslation('shifts')
  const { openingReadings, closingReadings, litersForNozzle, getEffectiveRate, availableNozzles } = form
  const opening = parseFloat(openingReadings[nozzleId] ?? '')
  const closing = parseFloat(closingReadings[nozzleId] ?? '')
  if (isFinite(opening) && isFinite(closing) && closing < opening) {
    return <span role="alert" className="font-medium text-bad">{t('backfill.meter.closingBelowOpening')}</span>
  }
  const liters = litersForNozzle(nozzleId)
  if (liters === null) return null
  const fuelType = availableNozzles.find((n) => n.id === nozzleId)?.fuelType ?? ''
  const rate = getEffectiveRate(fuelType)
  if (rate === null) {
    return <span className="text-ink-2">{t('backfill.meter.soldNoRate', { sold: formatUnits(liters, unit, 3) })}</span>
  }
  return (
    <span className="tabular-nums text-ink-2">
      = {formatUnits(liters, unit, 3)} × {formatCurrency(rate)} ={' '}
      <span className="font-semibold text-ink">{formatCurrency(roundToPaise(liters * rate))}</span>
    </span>
  )
}

/** Opening and closing meter for each chosen nozzle, with litres × rate worked out as they are typed. */
export function MeterReadingsSection({ form }: { form: BackfillForm }) {
  const { t } = useTranslation('shifts')
  const { selectedNozzleIds, openingReadings, setOpeningReadings, closingReadings, setClosingReadings, availableNozzles } = form
  if (selectedNozzleIds.size === 0) return null
  return (
    <div className="divide-y divide-border rounded-card border border-border">
      {[...selectedNozzleIds].map((nozzleId) => {
        const nozzle = availableNozzles.find((n) => n.id === nozzleId)
        if (!nozzle) return null
        const unit = FUEL_UNIT[nozzle.fuelType] ?? 'L'
        const name = t('backfill.meter.nozzle', { number: nozzle.nozzleNumber, fuel: codeLabel(nozzle.fuelType) })
        return (
          <div key={nozzleId} className="space-y-2 p-3">
            <p className="text-sm font-medium text-ink">{name}</p>
            <FormGrid>
              <FormField label={t('backfill.meter.opening')}>
                <NumericInput min="0" step="0.001" unit={unit} required
                  aria-label={t('backfill.meter.openingAria', { nozzle: name })}
                  value={openingReadings[nozzleId] ?? ''}
                  onChange={(e) => setOpeningReadings((r) => ({ ...r, [nozzleId]: e.target.value }))} />
              </FormField>
              <FormField label={t('backfill.meter.closing')}>
                <NumericInput min="0" step="0.001" unit={unit} required
                  aria-label={t('backfill.meter.closingAria', { nozzle: name })}
                  value={closingReadings[nozzleId] ?? ''}
                  onChange={(e) => setClosingReadings((r) => ({ ...r, [nozzleId]: e.target.value }))} />
              </FormField>
            </FormGrid>
            <p className="text-xs"><ReadingResult form={form} nozzleId={nozzleId} unit={unit} /></p>
          </div>
        )
      })}
    </div>
  )
}
