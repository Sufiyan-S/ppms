import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleOff, Hash, IndianRupee, Layers, Power } from 'lucide-react'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { RowActionMenu } from '../../components/RowActionMenu'
import type { RowActionMenuItem } from '../../components/RowActionMenu'

const MENU_ITEM_CLASS = 'text-ink hover:bg-surface-sunken'
const DANGER_ITEM_CLASS = 'text-bad hover:bg-bad-bg'

interface ProductCardMenuProps {
  product: AncillaryProduct
  title: string
  isOwnerOrAdmin: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  triggerRef: RefObject<HTMLButtonElement | null>
  statusPending: boolean
  onSetPrice: () => void
  onEditHsn: () => void
  onShowLots: () => void
  onAskDisable: () => void
  onEnable: () => void
}

/** The card's "⋮" menu: stock lots for everyone; price, HSN and disable or enable for an Owner or Admin. */
export function ProductCardMenu({
  product, title, isOwnerOrAdmin, open, onOpenChange, triggerRef, statusPending,
  onSetPrice, onEditHsn, onShowLots, onAskDisable, onEnable,
}: ProductCardMenuProps) {
  const { t } = useTranslation(['ancillary', 'common'])
  const icon = (Icon: typeof Hash) => <Icon size={14} strokeWidth={2} />
  const isActive = product.status === 'ACTIVE'

  const ownerItems: RowActionMenuItem[] = [
    { key: 'price', label: t('products.setPrice'), description: t('products.menu.setPriceHint'), icon: icon(IndianRupee), className: MENU_ITEM_CLASS, onSelect: onSetPrice },
    {
      key: 'hsn',
      label: t('products.menu.editHsn'),
      description: product.hsnCode ? t('products.hsn', { code: product.hsnCode }) : t('products.menu.noHsn'),
      icon: icon(Hash),
      className: MENU_ITEM_CLASS,
      onSelect: onEditHsn,
    },
  ]
  const statusItem: RowActionMenuItem = isActive
    ? { key: 'disable', label: t('common:actions.disable'), description: t('products.menu.disableHint'), icon: icon(CircleOff), className: DANGER_ITEM_CLASS, onSelect: onAskDisable }
    : { key: 'enable', label: t('common:actions.enable'), description: t('products.menu.enableHint'), icon: icon(Power), className: MENU_ITEM_CLASS, onSelect: onEnable, disabled: statusPending }

  return (
    <RowActionMenu
      label={t('products.menu.label', { name: title })}
      open={open}
      onOpenChange={onOpenChange}
      triggerRef={triggerRef}
      triggerClassName="ui-btn ui-btn-ghost min-h-11 min-w-11 text-base leading-none text-ink-2 hover:text-ink md:min-h-8 md:min-w-8"
      menuClassName="absolute bottom-full right-0 z-6 mb-2 w-64 overflow-hidden rounded-card border border-border bg-surface p-1.5 shadow-overlay"
      items={[
        { key: 'lots', label: t('products.menu.lots'), description: t('products.menu.lotsHint'), icon: icon(Layers), className: MENU_ITEM_CLASS, onSelect: onShowLots },
        ...(isOwnerOrAdmin ? [...ownerItems, statusItem] : []),
      ]}
    />
  )
}
