import { useTranslation } from 'react-i18next'
import { FormField } from '../../../components/FormField'
import { FormGrid } from '../../../components/layout/FormGrid'
import { NumericInput } from '../../../components/NumericInput'
import { FUEL_UNIT } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { formatCurrency } from '../../../utils/format'
import type { BackfillForm } from './useBackfillForm'

/** The price per litre on the shift date: read from price history, or typed in where none was recorded. */
export function FuelRatesSection({ form }: { form: BackfillForm }) {
  const { t } = useTranslation('shifts')
  const { shiftDate, fuelRateInputs, setFuelRateInputs, dbPriceMap, selectedFuelTypes } = form
  if (selectedFuelTypes.size === 0) return null
  const fuelTypes = [...selectedFuelTypes]
  const recorded = fuelTypes.filter((fuelType) => typeof dbPriceMap[fuelType] === 'number')
  const missing = fuelTypes.filter((fuelType) => typeof dbPriceMap[fuelType] !== 'number')

  return (
    <div className="space-y-3">
      {recorded.length > 0 && (
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">{t('backfill.rates.title', { date: shiftDate })}: </span>
          {recorded.map((fuelType) => `${codeLabel(fuelType)} ${formatCurrency(dbPriceMap[fuelType] as number)}/${FUEL_UNIT[fuelType] ?? 'L'}`).join(' · ')}
          <span className="block text-xs text-ink-3">{t('backfill.rates.fromHistory')}</span>
        </p>
      )}
      {missing.length > 0 && (
        <FormGrid>
          {missing.map((fuelType) => (
            <FormField key={fuelType} label={t('backfill.rates.inputLabel', { fuel: codeLabel(fuelType) })}
              help={t('backfill.rates.noPrice', { date: shiftDate })}>
              <NumericInput
                min="0.01"
                step="0.01"
                unit={`₹/${FUEL_UNIT[fuelType] ?? 'L'}`}
                value={fuelRateInputs[fuelType] ?? ''}
                onChange={(e) => setFuelRateInputs(r => ({ ...r, [fuelType]: e.target.value }))}
              />
            </FormField>
          ))}
        </FormGrid>
      )}
    </div>
  )
}
