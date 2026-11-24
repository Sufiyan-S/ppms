import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { KeyRound, Minus } from 'lucide-react'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient as PumpCreditClient } from '../../api/pumpApi'
import { RowActionMenu } from '../../components/RowActionMenu'
import { StatusBadge } from '../../components/StatusBadge'
import { useRowPanelFocus } from '../../hooks/useRowPanelFocus'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { AddSubAccountForm } from './AddSubAccountForm'
import { DisableClientPanel, RemovePortalPinPanel } from './ClientConfirmPanels'
import { EditCreditClientForm } from './EditCreditClientForm'
import { clientMenuItems } from './creditClientMenu'
import type { ClientPanel } from './creditClientMenu'
import { SetPortalPinModal } from './modals/SetPortalPinModal'

interface CreditClientRowProps {
  pumpId: number
  client: PumpCreditClient
  /** Name, phone and badges; the parent row's version also expands its sub-accounts. */
  summary: ReactNode
  headerClassName: string
  canManageClients: boolean
  canManagePortalPins: boolean
  menuOpen: boolean
  onMenuChange: (open: boolean) => void
  /** Only a parent row passes these: sub-accounts cannot have their own sub-accounts. */
  subAccounts?: PumpCreditClient[]
  onSubAccountAdded?: () => void
}

export function CreditClientRow({
  pumpId, client, summary, headerClassName, canManageClients, canManagePortalPins,
  menuOpen, onMenuChange, subAccounts, onSubAccountAdded,
}: CreditClientRowProps) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [openPanel, setOpenPanel] = useState<ClientPanel | null>(null)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useRowPanelFocus(openPanel, panelRef, menuButtonRef)
  const isSubAccount = subAccounts === undefined
  const closePanel = () => setOpenPanel(null)

  const enableMutation = useMutation({
    mutationFn: () => pumpApi.toggleCreditClientStatus(pumpId, client.id, true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['creditClients', pumpId] }),
    onError: (err) => addToast(parseApiError(err, t('clients.statusFailed')), 'error'),
  })

  const menuItems = clientMenuItems({
    t, client, isSubAccount, canManagePortalPins,
    onOpenPanel: setOpenPanel,
    onOpenPinModal: () => setPinModalOpen(true),
  })

  return (
    <>
      <div className={headerClassName}>
        {summary}
        {canManageClients && (
          <div className="ml-3 flex shrink-0 flex-wrap items-center justify-end gap-2">
            {canManagePortalPins && (client.hasPortalPin
              ? <StatusBadge tone="ok" icon={KeyRound} label={t('portalPin.set')} />
              : <StatusBadge tone="neutral" icon={Minus} label={t('portalPin.none')} />)}
            {!client.isActive && (
              <button type="button" onClick={() => enableMutation.mutate()} disabled={enableMutation.isPending}
                aria-label={t('clients.menu.enableAria', { name: client.name })}
                className="ui-btn ui-btn-secondary ui-btn-compact">
                {t('common:actions.enable')}
              </button>
            )}
            <RowActionMenu
              label={t('clients.menu.label', { name: client.name })}
              open={menuOpen}
              onOpenChange={onMenuChange}
              triggerRef={menuButtonRef}
              triggerClassName="ui-btn ui-btn-ghost text-base leading-none text-ink-2 hover:text-ink"
              menuClassName="absolute right-0 top-full z-6 mt-2 w-64 overflow-hidden rounded-card border border-border bg-surface p-1.5 shadow-overlay"
              items={menuItems}
            />
          </div>
        )}
      </div>

      {canManageClients && (
        <div ref={panelRef}>
          {openPanel === 'edit' && (
            <EditCreditClientForm pumpId={pumpId} client={client} indent={isSubAccount} onSaved={closePanel} onCancel={closePanel} />
          )}
          {openPanel === 'addSubAccount' && subAccounts && (
            <AddSubAccountForm pumpId={pumpId} parent={client} subAccounts={subAccounts}
              onAdded={() => { closePanel(); onSubAccountAdded?.() }} onCancel={closePanel} />
          )}
          {openPanel === 'removePin' && <RemovePortalPinPanel pumpId={pumpId} client={client} onClose={closePanel} />}
          {openPanel === 'disable' && <DisableClientPanel pumpId={pumpId} client={client} onClose={closePanel} />}
        </div>
      )}

      {pinModalOpen && <SetPortalPinModal pumpId={pumpId} client={client} onClose={() => setPinModalOpen(false)} />}
    </>
  )
}
