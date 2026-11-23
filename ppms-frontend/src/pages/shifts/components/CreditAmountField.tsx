import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { NumericInput } from '../../../components/NumericInput'
import { formatCurrency } from '../../../utils/format'
import { formatUnits } from '../close/closeShiftTotals'

export type CreditInputMode = 'amount' | 'liters'

interface Props {
  mode: CreditInputMode
  amount: string
  liters: string
  /** The shift's price for the chosen fuel; null switches off litre entry and the worked-out line. */
  price: number | null
  /** "L" or "kg" for the chosen fuel. */
  unit: string
  onAmountMode: () => void
  onLitresMode: () => void
  onAmountChange: (value: string) => void
  onLitresChange: (value: string) => void
}

/** Credit sale amount, typed in rupees or in litres, with the other figure worked out underneath as the user types. */
export function CreditAmountField({
  mode, amount, liters, price, unit, onAmountMode, onLitresMode, onAmountChange, onLitresChange,
}: Props) {
  const { t } = useTranslation('shifts')
  const inputId = useId()
  const resultId = useId()
  const amountValue = parseFloat(amount)
  const litresValue = mode === 'liters' ? parseFloat(liters) : price ? amountValue / price : NaN
  const showResult = price !== null && amountValue > 0 && isFinite(litresValue)

  const toggleClass = (active: boolean) =>
    `min-h-11 min-w-11 px-2 text-xs font-medium transition-colors first:rounded-l-control last:rounded-r-control ${
      active ? 'bg-primary text-on-primary' : 'bg-surface text-ink-2 hover:bg-surface-sunken'
    } disabled:cursor-not-allowed disabled:opacity-40`

  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between gap-2">
        <label htmlFor={inputId} className="ui-label mb-0">
          {mode === 'amount' ? t('creditEntry.amount') : t('creditEntry.quantity')}
        </label>
        <div role="group" aria-label={t('creditEntry.enterIn')} className="flex overflow-hidden rounded-control border border-control">
          <button type="button" onClick={onAmountMode} aria-pressed={mode === 'amount'}
            aria-label={t('creditEntry.amountModeAria')} className={toggleClass(mode === 'amount')}>
            ₹
          </button>
          <button type="button" onClick={onLitresMode} disabled={!price} aria-pressed={mode === 'liters'}
            aria-label={t('creditEntry.litresModeAria')} className={toggleClass(mode === 'liters')}>
            {unit}
          </button>
        </div>
      </div>
      {mode === 'amount' ? (
        <NumericInput id={inputId} step="0.01" min="0.01" unit="₹"
          value={amount} aria-describedby={showResult ? resultId : undefined}
          onChange={(e) => onAmountChange(e.target.value)} />
      ) : (
        <NumericInput id={inputId} step="0.001" min="0.001" unit={unit}
          value={liters} aria-describedby={showResult ? resultId : undefined}
          onChange={(e) => onLitresChange(e.target.value)} />
      )}
      {showResult && (
        <p id={resultId} className="ui-help tabular-nums">
          {formatUnits(litresValue, unit)} × {formatCurrency(price)} ={' '}
          <span className="font-semibold text-ink">{formatCurrency(amountValue)}</span>
        </p>
      )}
    </div>
  )
}
