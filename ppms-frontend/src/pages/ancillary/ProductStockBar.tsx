import { Trans, useTranslation } from 'react-i18next'
import { AlertTriangle, PackageX } from 'lucide-react'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { StatusBadge } from '../../components/StatusBadge'
import { formatNumberIn } from '../../i18n/format'
import { fmtCurrency } from './ancillaryFormat'
import { isLowStock, isOutOfStock, stockBarFillPercent, stockValue } from './productFilters'

/** Units in stock, a pill when low or out, a bar of how full stock is, and the buy price with the stock's value. */
export function ProductStockBar({ product, canSeeCost }: { product: AncillaryProduct; canSeeCost: boolean }) {
  const { t } = useTranslation('ancillary')
  const stock = product.currentStockUnits
  const threshold = product.lowStockThreshold
  const isOut = isOutOfStock(product)
  const isLow = !isOut && isLowStock(product)
  const fillColour = isOut ? 'bg-bad' : isLow ? 'bg-warn' : 'bg-ok'
  const valueOfStock = stockValue(product)

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-sm font-medium tabular-nums ${isOut ? 'text-bad' : 'text-ink'}`}>
          {t('products.unitsInStock', { count: stock, value: formatNumberIn(stock) })}
        </span>
        {isOut && <StatusBadge tone="bad" icon={PackageX} label={t('products.outOfStock')} />}
        {isLow && <StatusBadge tone="warn" icon={AlertTriangle} label={t('products.lowStock')} />}
      </div>
      <div className="ui-tank-gauge h-1.5" data-testid="stock-bar" aria-hidden="true">
        <div className={`ui-tank-gauge__fill ${fillColour}`} style={{ width: `${stockBarFillPercent(product)}%` }} />
      </div>
      {threshold != null && threshold > 0 && (
        <p className="text-xs text-ink-3">{t('products.lowAt', { value: formatNumberIn(threshold) })}</p>
      )}
      {canSeeCost && product.fifoCostPricePerUnit != null && (
        <p className="text-xs text-ink-3">
          <Trans t={t} i18nKey="products.buyPrice" values={{ price: fmtCurrency(product.fifoCostPricePerUnit) }}
            components={{ price: <span className="font-medium tabular-nums text-ink-2" /> }} />
          {valueOfStock != null && (
            <>
              {' · '}
              <Trans t={t} i18nKey="products.stockValue" values={{ value: fmtCurrency(valueOfStock) }}
                components={{ value: <span className="font-medium tabular-nums text-ink-2" /> }} />
            </>
          )}
        </p>
      )}
    </div>
  )
}
