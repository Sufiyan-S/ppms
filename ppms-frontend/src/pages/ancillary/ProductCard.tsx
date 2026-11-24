import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Droplet, Package, PackagePlus, Pause, ShoppingCart, Weight } from 'lucide-react'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct, UnitOfMeasure } from '../../api/ancillaryApi'
import { StatusBadge } from '../../components/StatusBadge'
import { useRowPanelFocus } from '../../hooks/useRowPanelFocus'
import { formatNumberIn } from '../../i18n/format'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { packSize } from './ancillaryFormat'
import { DisableProductPanel } from './DisableProductPanel'
import { ProductCardMenu } from './ProductCardMenu'
import { ProductPriceBlock } from './ProductPriceBlock'
import { ProductSoldToday } from './ProductSoldToday'
import { ProductStockBar } from './ProductStockBar'
import { isOutOfStock, productTitle } from './productFilters'

const UNIT_ICON: Record<UnitOfMeasure, typeof Package> = { LITRE: Droplet, KG: Weight, PIECE: Package }
const FOOTER_BUTTON = 'ui-btn inline-flex items-center justify-center gap-1.5 min-h-11 md:min-h-9'

export interface ProductCardProps {
  pumpId: number
  product: AncillaryProduct
  isOwnerOrAdmin: boolean
  isManagerOrAbove: boolean
  canSell: boolean
  onSell: () => void
  onStockIn: () => void
  onShowLots: () => void
  onSetPrice: () => void
  onEditHsn: () => void
}

/** One counter product: what it is, its price and margin, its stock, today's sales, and Sell, Stock in and a menu for the rest. */
export function ProductCard({
  pumpId, product, isOwnerOrAdmin, isManagerOrAbove, canSell, onSell, onStockIn, onShowLots, onSetPrice, onEditHsn,
}: ProductCardProps) {
  const { t } = useTranslation(['ancillary', 'common'])
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const blockedReasonId = useId()
  const [menuOpen, setMenuOpen] = useState(false)
  const [isConfirmingDisable, setIsConfirmingDisable] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useRowPanelFocus(isConfirmingDisable ? 'disable' : null, panelRef, menuButtonRef)

  const title = productTitle(product)
  const isActive = product.status === 'ACTIVE'
  const pack = packSize(product.packageSize, product.unitOfMeasure)
  const UnitIcon = UNIT_ICON[product.unitOfMeasure] ?? Package

  const statusMutation = useMutation({
    mutationFn: (status: 'ACTIVE' | 'INACTIVE') => ancillaryApi.setProductStatus(pumpId, product.id, status),
    onSuccess: (_, status) => {
      setIsConfirmingDisable(false)
      qc.invalidateQueries({ queryKey: ['ancillaryProducts', pumpId] })
      addToast(status === 'ACTIVE' ? t('products.enabled') : t('products.disabled'), 'success')
    },
    onError: (err) => addToast(parseApiError(err, t('products.statusFailed')), 'error'),
  })

  const sellBlockedReason = !isActive ? t('products.blocked.disabled')
    : isOutOfStock(product) ? t('products.blocked.outOfStock')
    : product.currentSellingPricePerUnit == null && !isOwnerOrAdmin ? t('products.blocked.noPrice')
    : null
  const shownReason = canSell ? sellBlockedReason : !isActive && isManagerOrAbove ? t('products.blocked.disabled') : null

  return (
    <article aria-label={title} className={`ui-product-card ${isActive ? '' : 'ui-product-card--disabled'}`}>
      <header className="flex items-start gap-3">
        <span aria-hidden="true" className={`ui-hub-card__icon ${isActive ? '' : 'bg-neutral-bg text-ink-3'}`}>
          <UnitIcon size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={`break-words text-base font-semibold leading-snug ${isActive ? 'text-ink' : 'text-ink-2'}`}>{title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-badge border border-border px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-2">
              {t(`packSize.${pack.unit}`, { value: formatNumberIn(pack.amount, { maximumFractionDigits: 2 }) })}
            </span>
            {!isActive && <StatusBadge tone="neutral" icon={Pause} label={t('products.statusDisabled')} />}
          </div>
        </div>
      </header>

      <ProductPriceBlock product={product} title={title} canSeeCost={isManagerOrAbove} canSetPrice={isOwnerOrAdmin} onSetPrice={onSetPrice} />
      <ProductStockBar product={product} canSeeCost={isManagerOrAbove} />
      <ProductSoldToday product={product} />

      <footer className="mt-auto border-t border-border pt-3">
        <div className="flex items-center gap-2">
          {canSell && (
            <button type="button" onClick={onSell} disabled={sellBlockedReason != null}
              aria-describedby={sellBlockedReason ? blockedReasonId : undefined} className={`${FOOTER_BUTTON} flex-1 ui-btn-primary`}>
              <ShoppingCart size={14} strokeWidth={2} aria-hidden="true" />
              {t('products.sell')}
            </button>
          )}
          {isManagerOrAbove ? (
            <button type="button" onClick={onStockIn} disabled={!isActive} aria-label={t('products.stockInOf', { name: title })}
              title={t('products.stockInOf', { name: title })} aria-describedby={!isActive ? blockedReasonId : undefined}
              className={`${FOOTER_BUTTON} ui-btn-secondary ui-btn-compact ${canSell ? '' : 'flex-1'}`}>
              <PackagePlus size={14} strokeWidth={2} aria-hidden="true" />
              {t('products.stockIn')}
            </button>
          ) : (
            <button type="button" onClick={onShowLots} className={`${FOOTER_BUTTON} flex-1 ui-btn-secondary`}>
              {t('products.inventory')}
            </button>
          )}
          {isManagerOrAbove && (
            <ProductCardMenu
              product={product}
              title={title}
              isOwnerOrAdmin={isOwnerOrAdmin}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              triggerRef={menuButtonRef}
              statusPending={statusMutation.isPending}
              onSetPrice={onSetPrice}
              onEditHsn={onEditHsn}
              onShowLots={onShowLots}
              onAskDisable={() => setIsConfirmingDisable(true)}
              onEnable={() => statusMutation.mutate('ACTIVE')}
            />
          )}
        </div>
        {shownReason && <p id={blockedReasonId} className="mt-2 text-xs text-ink-3">{shownReason}</p>}
      </footer>

      {isConfirmingDisable && (
        <div ref={panelRef} className="-mx-4 -mb-4 overflow-hidden rounded-b-card">
          <DisableProductPanel
            isPending={statusMutation.isPending}
            onDisable={() => statusMutation.mutate('INACTIVE')}
            onCancel={() => setIsConfirmingDisable(false)}
          />
        </div>
      )}
    </article>
  )
}
