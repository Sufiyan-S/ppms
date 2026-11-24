import { useTranslation } from 'react-i18next'
import { FUEL_STOCK_COLORS } from '../../../constants/fuel'
import { formatNumberIn } from '../../../i18n/format'
import { formatDecimal } from '../../../utils/format'

interface TankGaugeProps {
  tankName: string
  fuelType: string
  stock: number
  capacity: number
  unit: string
  isLow: boolean
}

/** How full a tank is: the percentage and "stock of capacity" in words, and a bar in the fuel's colour. */
export function TankGauge({ tankName, fuelType, stock, capacity, unit, isLow }: TankGaugeProps) {
  const { t } = useTranslation('setup')
  const percent = capacity > 0 ? Math.min(100, Math.max(0, (stock / capacity) * 100)) : 0
  const percentText = t('tanks.percentFull', { percent: formatNumberIn(percent, { maximumFractionDigits: 0 }) })
  const stockText = t('tanks.stockOfCapacity', {
    stock: `${formatDecimal(stock)} ${unit}`,
    capacity: `${formatNumberIn(capacity, { minimumFractionDigits: 0 })} ${unit}`,
  })
  const fillColour = isLow ? 'bg-bad' : FUEL_STOCK_COLORS[fuelType]?.bar ?? 'bg-ink-3'

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className={`text-xl font-semibold tabular-nums ${isLow ? 'text-bad' : 'text-ink'}`}>{percentText}</span>
        <span className="text-xs text-ink-2 tabular-nums">{stockText}</span>
      </div>
      <div
        role="meter"
        aria-label={t('tanks.gaugeLabel', { name: tankName })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={`${percentText} · ${stockText}`}
        className="ui-tank-gauge mt-2"
      >
        <div className={`ui-tank-gauge__fill ${fillColour}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
