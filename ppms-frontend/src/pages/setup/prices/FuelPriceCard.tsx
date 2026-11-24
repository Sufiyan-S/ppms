import { Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FuelType } from '../../../types/shift'
import { MoneyText } from '../../../components/AmountText'
import { FormField } from '../../../components/FormField'
import { NumericInput } from '../../../components/NumericInput'
import { FUEL_BADGE, FUEL_STOCK_COLORS, FUEL_UNIT } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { formatCurrency } from '../../../utils/format'
import { priceChange } from '../fuelPriceChange'
import type { PriceDirection } from '../fuelPriceChange'
import { formatPercent } from './formatPercent'

const DIRECTION_ICON: Record<PriceDirection, LucideIcon> = { up: TrendingUp, down: TrendingDown, same: Minus, first: Sparkles }

interface Props {
  fuelType: FuelType
  currentPrice: number | undefined
  value: string
  onChange: (value: string) => void
}

/** One fuel's price: its colour and name, today's price, and the new price with how far it moves before saving. */
export function FuelPriceCard({ fuelType, currentPrice, value, onChange }: Props) {
  const { t } = useTranslation('setup')
  const unit = FUEL_UNIT[fuelType] ?? 'L'
  const fuelName = codeLabel(fuelType)
  const change = priceChange(currentPrice, value)

  let changeLine: string
  if (!change) {
    changeLine = currentPrice == null ? t('prices.noCurrentPrice') : t('prices.keepHint', { price: formatCurrency(currentPrice) })
  } else if (change.direction === 'first' || currentPrice == null) {
    changeLine = t('prices.firstPrice')
  } else {
    changeLine = t(`prices.change.${change.direction}`, {
      amount: formatCurrency(Math.abs(change.amount)),
      percent: change.percent === null ? '' : formatPercent(change.percent),
      current: formatCurrency(currentPrice),
    })
  }
  const ChangeIcon = change ? DIRECTION_ICON[change.direction] : null

  return (
    <article aria-label={fuelName} className="ui-card-plain relative flex flex-col gap-3 p-4 pl-5">
      <span aria-hidden="true" className={`ui-choice-tile__fuel-bar ${FUEL_STOCK_COLORS[fuelType]?.bar ?? 'bg-ink-3'}`} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className={`rounded-badge px-2 py-0.5 text-xs font-semibold ${FUEL_BADGE[fuelType] ?? 'bg-surface-sunken text-ink-2'}`}>
          {fuelName}
        </span>
        <div className="text-right">
          <p className="ui-kpi-label">{t('prices.currentPrice')}</p>
          {currentPrice == null
            ? <p className="text-sm text-ink-3">{t('prices.notSet')}</p>
            : <p className="text-lg font-semibold text-ink tabular-nums"><MoneyText value={currentPrice} /><span className="text-xs font-normal text-ink-3">/{unit}</span></p>}
        </div>
      </div>
      <FormField
        label={<>{t('prices.newPrice')}{' '}<span className="sr-only">({fuelName})</span></>}
        help={(
          <span className={`inline-flex items-start gap-1 ${change ? 'font-medium text-ink' : ''}`}>
            {ChangeIcon && <ChangeIcon size={14} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" />}
            {changeLine}
          </span>
        )}
      >
        <NumericInput step="0.01" min="0.01" unit={`₹/${unit}`} value={value} onChange={(e) => onChange(e.target.value)} />
      </FormField>
    </article>
  )
}
