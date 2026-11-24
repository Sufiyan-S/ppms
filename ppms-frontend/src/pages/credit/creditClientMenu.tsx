import type { TFunction } from 'i18next'
import { CircleOff, KeyRound, Pencil, UserPlus, X } from 'lucide-react'
import type { CreditClient as PumpCreditClient } from '../../api/pumpApi'
import type { RowActionMenuItem } from '../../components/RowActionMenu'

export type ClientPanel = 'edit' | 'addSubAccount' | 'removePin' | 'disable'

const MENU_ITEM_CLASS = 'text-ink hover:bg-surface-sunken'
const DANGER_ITEM_CLASS = 'text-bad hover:bg-bad-bg'

interface ClientMenuOptions {
  t: TFunction<['credit', 'common']>
  client: PumpCreditClient
  isSubAccount: boolean
  canManagePortalPins: boolean
  onOpenPanel: (panel: ClientPanel) => void
  onOpenPinModal: () => void
}

export function clientMenuItems({ t, client, isSubAccount, canManagePortalPins, onOpenPanel, onOpenPinModal }: ClientMenuOptions): RowActionMenuItem[] {
  const icon = (Icon: typeof Pencil) => <Icon size={14} strokeWidth={2} />
  return [
    { key: 'edit', label: t('clients.menu.edit'), description: t('clients.menu.editHint'), icon: icon(Pencil), className: MENU_ITEM_CLASS, onSelect: () => onOpenPanel('edit') },
    ...(!isSubAccount ? [{ key: 'addSubAccount', label: t('clients.addSubAccount'), description: t('clients.menu.addSubAccountHint'), icon: icon(UserPlus), className: MENU_ITEM_CLASS, onSelect: () => onOpenPanel('addSubAccount') }] : []),
    ...(canManagePortalPins ? [{
      key: 'pin',
      label: client.hasPortalPin ? t('portalPin.change') : t('portalPin.setAction'),
      description: t('clients.menu.pinHint'),
      icon: icon(KeyRound),
      className: MENU_ITEM_CLASS,
      onSelect: onOpenPinModal,
    }] : []),
    ...(canManagePortalPins && client.hasPortalPin ? [{ key: 'removePin', label: t('portalPin.remove'), description: t('clients.menu.removePinHint'), icon: icon(X), className: DANGER_ITEM_CLASS, onSelect: () => onOpenPanel('removePin') }] : []),
    ...(client.isActive ? [{ key: 'disable', label: t('common:actions.disable'), description: t('clients.menu.disableHint'), icon: icon(CircleOff), className: DANGER_ITEM_CLASS, onSelect: () => onOpenPanel('disable') }] : []),
  ]
}
