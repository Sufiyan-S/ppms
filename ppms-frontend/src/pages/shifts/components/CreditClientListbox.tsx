import { useTranslation } from 'react-i18next'
import { maskPhone } from '../../../utils/maskPhone'
import { optionElementId } from './creditClientOptions'
import type { CreditClientOption } from './creditClientOptions'

interface Props {
  id: string
  options: CreditClientOption[]
  activeClientId: number | null
  showCallManager: boolean
  large: boolean
  onPick: (option: CreditClientOption) => void
}

export function CreditClientListbox({ id, options, activeClientId, showCallManager, large, onPick }: Props) {
  const { t } = useTranslation('shifts')
  return (
    <ul id={id} role="listbox" aria-label={t('clientSearch.listAria')} className="m-0 list-none p-0">
      {options.map((option) => {
        const { client, blockReason, availableText } = option
        const isActive = client.id === activeClientId
        const blocked = blockReason !== null
        return (
          <li
            key={client.id}
            id={optionElementId(id, client.id)}
            role="option"
            aria-selected={isActive}
            aria-disabled={blocked || undefined}
            onMouseDown={(event) => {
              event.preventDefault()
              onPick(option)
            }}
            className={`flex items-center justify-between gap-2 rounded-control px-3 text-sm ${large ? 'min-h-12 py-2' : 'py-2'} ${
              blocked ? 'cursor-not-allowed text-ink-3' : 'cursor-pointer text-ink hover:bg-surface-sunken'
            } ${isActive ? 'bg-info-bg' : ''}`}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{client.name}</span>
              {blocked ? (
                <span className="block text-xs text-bad">
                  {blockReason}
                  {availableText && ` · ${availableText}`}
                  {showCallManager && ` · ${t('clientSearch.callManager')}`}
                </span>
              ) : availableText && (
                <span className="block text-xs text-ink-3">{availableText}</span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {client.isParent && (
                <span className="rounded-badge bg-info-bg px-1.5 py-0.5 text-xs font-medium text-info">{t('clientSearch.hasSubAccounts')}</span>
              )}
              {client.phone && <span className="text-xs text-ink-3">{maskPhone(client.phone)}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
