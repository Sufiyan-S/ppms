import { useTranslation } from 'react-i18next'
import { Receipt } from 'lucide-react'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { formatNumberIn } from '../../i18n/format'
import { fmtCurrency } from './ancillaryFormat'

export function ProductSoldToday({ product }: { product: AncillaryProduct }) {
  const { t } = useTranslation('ancillary')
  const units = product.soldTodayUnits

  return (
    <p className={`inline-flex items-center gap-1.5 text-xs ${units > 0 ? 'font-medium text-ink-2' : 'text-ink-3'}`}>
      <Receipt size={14} strokeWidth={2} aria-hidden="true" />
      {units > 0
        ? t('products.soldToday', { units: formatNumberIn(units), amount: fmtCurrency(product.soldTodayAmount) })
        : t('products.noSalesToday')}
    </p>
  )
}
