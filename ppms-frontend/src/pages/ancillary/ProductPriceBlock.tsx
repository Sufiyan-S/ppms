import { useTranslation } from 'react-i18next'
import { CircleAlert, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { MoneyText } from '../../components/AmountText'
import { formatNumberIn } from '../../i18n/format'
import { formatWithSign } from '../../utils/format'

interface ProductPriceBlockProps {
  product: AncillaryProduct
  title: string
  canSeeCost: boolean
  canSetPrice: boolean
  onSetPrice: () => void
}

/** The selling price large, with the margin over the buy price; or a warning that no price is set yet. */
export function ProductPriceBlock({ product, title, canSeeCost, canSetPrice, onSetPrice }: ProductPriceBlockProps) {
  const { t } = useTranslation('ancillary')
  const price = product.currentSellingPricePerUnit

  if (price == null) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold text-warn">
          <CircleAlert size={16} strokeWidth={2} aria-hidden="true" />
          {t('products.noSellingPrice')}
        </span>
        {canSetPrice ? (
          <button type="button" onClick={onSetPrice} aria-label={t('products.setPriceOf', { name: title })}
            className="ui-link min-h-11 md:min-h-8">
            {t('products.setPrice')}
          </button>
        ) : (
          <span className="text-xs text-ink-3">{t('products.askOwnerToSetPrice')}</span>
        )}
      </p>
    )
  }

  const cost = canSeeCost ? product.fifoCostPricePerUnit : null
  return (
    <div>
      <p className="flex items-baseline gap-1">
        <MoneyText value={price} className="text-2xl font-semibold text-ink" />
        <span className="text-sm text-ink-3">{t('products.perUnit')}</span>
      </p>
      {cost != null && <MarginLine price={price} cost={cost} />}
    </div>
  )
}

function MarginLine({ price, cost }: { price: number; cost: number }) {
  const { t } = useTranslation('ancillary')
  const margin = price - cost
  const percent = price > 0 ? (margin / price) * 100 : 0
  const formatPercent = (value: number) => formatNumberIn(value, { maximumFractionDigits: 1 })
  const percentText = margin < 0 ? formatWithSign(percent, formatPercent) : formatPercent(percent)
  const { label, Icon } = margin > 0
    ? { label: t('products.margin'), Icon: TrendingUp }
    : margin < 0
      ? { label: t('products.belowCost'), Icon: TrendingDown }
      : { label: t('products.noMargin'), Icon: Minus }

  return (
    <p className={`mt-1 inline-flex flex-wrap items-center gap-1 text-xs font-medium ${margin > 0 ? 'text-ok' : 'text-warn'}`}>
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
      {label} <MoneyText value={margin} showSign={margin < 0} /> · {t('products.marginPercent', { percent: percentText })}
    </p>
  )
}
