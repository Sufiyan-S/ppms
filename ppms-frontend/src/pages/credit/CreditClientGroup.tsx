import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Pause, Users } from 'lucide-react'
import type { CreditClient as PumpCreditClient } from '../../api/pumpApi'
import { StatusBadge } from '../../components/StatusBadge'
import { onActivateKey } from '../../utils/keyboard'
import { CreditClientRow } from './CreditClientRow'

interface CreditClientGroupProps {
  pumpId: number
  parent: PumpCreditClient
  subAccounts: PumpCreditClient[]
  isExpanded: boolean
  onToggle: () => void
  onExpand: () => void
  canManageClients: boolean
  canManagePortalPins: boolean
  openMenuClientId: number | null
  onMenuChange: (clientId: number | null) => void
}

function ClientContact({ client }: { client: PumpCreditClient }) {
  return (
    <div className="mt-0.5 flex items-center gap-3">
      {client.phone && <span className="text-xs text-ink-3">{client.phone}</span>}
      {client.notes && <span className="max-w-xs truncate text-xs italic text-ink-3">{client.notes}</span>}
    </div>
  )
}

/** A parent client's card: its own row, then its sub-accounts while expanded. */
export function CreditClientGroup({
  pumpId, parent, subAccounts, isExpanded, onToggle, onExpand,
  canManageClients, canManagePortalPins, openMenuClientId, onMenuChange,
}: CreditClientGroupProps) {
  const { t } = useTranslation(['credit', 'common'])
  const subAccountsId = useId()
  const hasSubAccounts = subAccounts.length > 0
  const menuOpenInGroup = openMenuClientId === parent.id || subAccounts.some(c => c.id === openMenuClientId)
  const disabledBadge = <StatusBadge tone="neutral" icon={Pause} label={t('clients.disabled')} />
  const rowProps = (client: PumpCreditClient) => ({
    pumpId, client, canManageClients, canManagePortalPins,
    menuOpen: openMenuClientId === client.id,
    onMenuChange: (open: boolean) => onMenuChange(open ? client.id : null),
  })

  const parentSummary = (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 ${hasSubAccounts ? 'cursor-pointer' : ''}`}
      role={hasSubAccounts ? 'button' : undefined}
      tabIndex={hasSubAccounts ? 0 : undefined}
      aria-expanded={hasSubAccounts ? isExpanded : undefined}
      aria-controls={hasSubAccounts ? subAccountsId : undefined}
      onClick={hasSubAccounts ? onToggle : undefined}
      onKeyDown={hasSubAccounts ? onActivateKey(onToggle) : undefined}
    >
      {hasSubAccounts && (
        <svg aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      )}
      <div>
        <div className="flex items-center gap-2">
          <p className={`text-sm font-semibold ${parent.isActive ? 'text-ink' : 'text-ink-3'}`}>{parent.name}</p>
          {parent.isParent && <StatusBadge tone="info" icon={Users} label={t('clients.parentBadge', { count: subAccounts.length })} />}
          {!parent.isActive && disabledBadge}
        </div>
        <ClientContact client={parent} />
      </div>
    </div>
  )

  return (
    <div className={`ui-card relative p-0 ${menuOpenInGroup ? 'z-20' : 'overflow-hidden'}`}>
      <CreditClientRow
        {...rowProps(parent)}
        summary={parentSummary}
        headerClassName={`ui-accordion-trigger ${hasSubAccounts ? 'select-none' : ''}`}
        subAccounts={subAccounts}
        onSubAccountAdded={onExpand}
      />
      <div id={subAccountsId}>
        {isExpanded && subAccounts.map(child => (
          <div key={child.id} className="border-t border-border">
            <CreditClientRow
              {...rowProps(child)}
              headerClassName="flex items-center justify-between py-2 pl-7 pr-3"
              summary={
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="shrink-0 text-ink-3">└</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium ${child.isActive ? 'text-ink-2' : 'text-ink-3'}`}>{child.name}</p>
                      {!child.isActive && disabledBadge}
                    </div>
                    <ClientContact client={child} />
                  </div>
                </div>
              }
            />
          </div>
        ))}
      </div>
    </div>
  )
}
