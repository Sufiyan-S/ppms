import { useId, useMemo, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { pumpApi } from '../../../api/pumpApi'
import type { CreditClientSummary } from '../../../api/pumpApi'
import { useAuthStore } from '../../../store/authStore'
import { usePumpStore } from '../../../store/usePumpStore'
import { canAccessPage, canPerformAction } from '../../../permissions/permissions'
import { useIsPhone } from '../../../hooks/useIsPhone'
import { ModalPortal } from '../../../components/ModalPortal'
import { IconButton } from '../../../components/IconButton'
import { ModalToneIcon } from '../../../components/ModalToneIcon'
import { CreditClientListbox } from './CreditClientListbox'
import { matchingRootClients, optionElementId, toClientOption } from './creditClientOptions'
import type { CreditClientOption } from './creditClientOptions'
import { readRecentClientIds, rememberRecentClient } from './recentCreditClients'

interface Props {
  search: string
  creditClients: CreditClientSummary[]
  showDropdown: boolean
  onSearchChange: (text: string) => void
  onShowDropdownChange: (show: boolean) => void
  onSelect: (client: CreditClientSummary) => void
  inputClassName: string
  placeholder: string
  showNoClientsHint?: boolean
  /** False at shift close, where credit already given to an overdue client is still recorded. */
  blockOverdue?: boolean
}

export function CreditClientSearch({
  search, creditClients, showDropdown, onSearchChange, onShowDropdownChange, onSelect,
  inputClassName, placeholder, showNoClientsHint = false, blockOverdue = true,
}: Props) {
  const { t } = useTranslation(['shifts', 'common'])
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const role = user?.role
  const selectedPumpId = usePumpStore((state) => state.selectedPumpId)
  const pumpId = creditClients[0]?.pumpId ?? selectedPumpId
  const isPhone = useIsPhone()
  const listboxId = useId()
  const [activeClientId, setActiveClientId] = useState<number | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [recentIds, setRecentIds] = useState<number[]>(
    () => (pumpId != null && user ? readRecentClientIds(pumpId, user.userId) : []),
  )

  const { data: standings, isError: standingFailed } = useQuery({
    queryKey: ['creditStanding', pumpId],
    queryFn:  () => pumpApi.getCreditStanding(pumpId!),
    enabled:  pumpId != null && creditClients.length > 0,
  })

  const canAddClient = canAccessPage('credit', role) && canPerformAction('credit:manage-client', role)
  const showCallManager = role === 'OPERATOR'
  const noMatchText = search.trim() ? t('clientSearch.noMatchFor', { search: search.trim() }) : t('clientSearch.noMatch')
  const hasRootClients = creditClients.some((client) => client.parentClientId === null)

  const optionFor = useMemo(() => {
    const standingById = new Map((standings ?? []).map((standing) => [standing.clientId, standing]))
    return (client: CreditClientSummary) => toClientOption(client, standingById.get(client.id), blockOverdue)
  }, [standings, blockOverdue])

  const options = matchingRootClients(creditClients, search).map(optionFor)
  const recentOptions = recentIds
    .map((id) => creditClients.find((client) => client.id === id && client.parentClientId === null))
    .filter((client): client is CreditClientSummary => client !== undefined)
    .map(optionFor)
  const activeOption = options.find((option) => option.client.id === activeClientId) ?? null

  const pick = (option: CreditClientOption) => {
    if (option.blockReason !== null) return
    if (pumpId != null && user) {
      rememberRecentClient(pumpId, user.userId, option.client.id)
      setRecentIds(readRecentClientIds(pumpId, user.userId))
    }
    setActiveClientId(null)
    setSheetOpen(false)
    onSelect(option.client)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    onShowDropdownChange(false)
  }

  const handleComboboxKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      onShowDropdownChange(true)
      if (options.length === 0) return
      const currentIndex = options.findIndex((option) => option.client.id === activeClientId)
      const step = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = currentIndex === -1
        ? (step === 1 ? 0 : options.length - 1)
        : (currentIndex + step + options.length) % options.length
      const nextId = options[nextIndex].client.id
      setActiveClientId(nextId)
      document.getElementById(optionElementId(listboxId, nextId))?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter' && activeOption) {
      event.preventDefault()
      pick(activeOption)
    } else if (event.key === 'Escape' && !isPhone && showDropdown) {
      event.preventDefault()
      setActiveClientId(null)
      onShowDropdownChange(false)
    }
  }

  const listOpen = isPhone ? sheetOpen : showDropdown && hasRootClients

  const comboboxProps = {
    role: 'combobox' as const,
    'aria-expanded': listOpen,
    'aria-controls': listboxId,
    'aria-autocomplete': 'list' as const,
    'aria-activedescendant': activeOption ? optionElementId(listboxId, activeOption.client.id) : undefined,
    value: search,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      setActiveClientId(null)
      onSearchChange(event.target.value)
    },
    onKeyDown: handleComboboxKeyDown,
    placeholder,
  }

  const recentChips = recentOptions.length > 0 && (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('clientSearch.recentAria')}>
      <span className="text-xs text-ink-3">{t('clientSearch.recent')}</span>
      {recentOptions.map((option) => (
        <button
          key={option.client.id}
          type="button"
          disabled={option.blockReason !== null}
          title={option.blockReason ?? undefined}
          aria-label={option.blockReason ? `${option.client.name}, ${option.blockReason}` : option.client.name}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => pick(option)}
          className="ui-btn ui-btn-secondary min-h-0 rounded-badge px-2 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          {option.client.name}
        </button>
      ))}
    </div>
  )

  const noMatch = options.length === 0 && (
    !canAddClient ? (
      <div className="px-3 py-2 text-xs" role="status">
        <span className="block truncate text-ink-3">{noMatchText}</span>
        <span className="block text-ink-2">{t('clientSearch.askManager')}</span>
      </div>
    ) : (
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => navigate('/dashboard/credit?tab=clients')}
        className="flex w-full items-center justify-between gap-2 rounded-control px-3 py-2 text-left text-sm hover:bg-surface-sunken"
      >
        <span className="truncate text-xs text-ink-3">{noMatchText}</span>
        <span className="shrink-0 text-xs font-medium text-primary">{t('clientSearch.addClient')}</span>
      </button>
    )
  )

  const standingNote = standingFailed && (
    <p className="px-3 py-1 text-xs text-warn" role="status">
      {t('clientSearch.standingFailed')}
    </p>
  )

  return (
    <div className="ui-search-shell space-y-1.5">
      {isPhone ? (
        <div>
          <span className="ui-label">{t('clientSearch.client')}</span>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => { setSheetOpen(true); onShowDropdownChange(true) }}
            className={`flex w-full items-center rounded-control border border-border bg-surface px-3 text-left ${search ? 'text-ink' : 'text-ink-3'} min-h-11`}
          >
            {search || placeholder}
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <label className="block">
              <span className="ui-label">{t('clientSearch.client')}</span>
              <input
                type="text"
                {...comboboxProps}
                onFocus={() => onShowDropdownChange(true)}
                onBlur={() => { setActiveClientId(null); onShowDropdownChange(false) }}
                className={inputClassName}
              />
            </label>
            {listOpen && (
              <div className="ui-card absolute left-0 right-0 top-full z-50 mt-0.5 max-h-72 overflow-y-auto p-1">
                {standingNote}
                {noMatch || (
                  <CreditClientListbox id={listboxId} options={options} activeClientId={activeClientId}
                    showCallManager={showCallManager} large={false} onPick={pick} />
                )}
              </div>
            )}
          </div>
          {recentChips}
        </>
      )}

      {isPhone && sheetOpen && (
        <ModalPortal onClose={closeSheet}>
          <div className="ui-sheet-backdrop">
            <div className="ui-sheet-panel">
              <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
                <ModalToneIcon tone="info" />
                <div className="ui-modal-heading">
                  <h2 className="ui-modal-title">{t('clientSearch.chooseClient')}</h2>
                  <p className="ui-modal-subtitle">{t('clientSearch.chooseClientSubtitle')}</p>
                </div>
                <IconButton label={t('common:actions.close')} icon={<X size={20} />} onClick={closeSheet} className="ui-btn ui-btn-ghost ui-modal-close" />
              </div>
              <div className="space-y-2 px-4 pt-3">
                <input type="search" aria-label={t('clientSearch.searchAria')} data-autofocus {...comboboxProps} />
                {recentChips}
                {standingNote}
              </div>
              <div className="ui-sheet-body">
                {noMatch || (
                  <CreditClientListbox id={listboxId} options={options} activeClientId={activeClientId}
                    showCallManager={showCallManager} large onPick={pick} />
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {showNoClientsHint && creditClients.length === 0 && (
        <p className="mt-1 text-xs text-warn">
          {t('clientSearch.noClients')}
        </p>
      )}
    </div>
  )
}
