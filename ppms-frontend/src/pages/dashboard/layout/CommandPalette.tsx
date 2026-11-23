import { useEffect, useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ModalPortal } from '../../../components/ModalPortal'
import { useAuthStore } from '../../../store/authStore'
import { commandItemsFor, filterCommandItems } from './commandItems'
import type { CommandItem } from './commandItems'

/**
 * "Jump to…": a dialog holding a combobox (WAI-ARIA APG, list autocomplete) over the pages and quick actions
 * the signed-in role can use. Arrow keys move through the results, Enter opens one, Escape closes.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(['nav', 'common'])
  const navigate = useNavigate()
  const role = useAuthStore((state) => state.user?.role)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listboxId = useId()

  const results = filterCommandItems(commandItemsFor(role), query)
  const activeItem = results[Math.min(activeIndex, results.length - 1)]
  const optionId = (item: CommandItem) => `${listboxId}-${item.id}`
  const activeOptionId = activeItem ? optionId(activeItem) : undefined
  const groups = [
    { kind: 'page' as const, label: t('palette.pages'), items: results.filter((item) => item.kind === 'page') },
    { kind: 'action' as const, label: t('palette.actions.label'), items: results.filter((item) => item.kind === 'action') },
  ].filter((group) => group.items.length > 0)

  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' })
  }, [activeOptionId])

  const choose = (item: CommandItem) => {
    onClose()
    navigate(item.path)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return
    const current = results.indexOf(activeItem)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(activeItem)
    }
  }

  return (
    <ModalPortal onClose={onClose} closeOnBackdropClick>
      <div className="ui-modal-backdrop ui-command-backdrop">
        <div className="ui-modal-panel ui-command-panel">
          <h2 className="ui-modal-title sr-only">{t('palette.title')}</h2>
          <div className="ui-command-search">
            <Search size={18} strokeWidth={2} aria-hidden="true" className="shrink-0 text-ink-3" />
            <input
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={activeOptionId}
              aria-label={t('palette.searchLabel')}
              placeholder={t('palette.placeholder')}
              autoComplete="off"
              spellCheck={false}
              data-autofocus
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }}
              onKeyDown={handleKeyDown}
              className="ui-command-input"
            />
          </div>
          <div id={listboxId} role="listbox" aria-label={t('palette.resultsLabel')} className="ui-command-list">
            {groups.map((group) => (
              <div key={group.kind} role="group" aria-labelledby={`${listboxId}-${group.kind}`}>
                <div id={`${listboxId}-${group.kind}`} role="presentation" className="ui-command-group-label">{group.label}</div>
                {group.items.map((item) => {
                  const isActive = item === activeItem
                  return (
                    <div
                      key={item.id}
                      id={optionId(item)}
                      role="option"
                      tabIndex={-1}
                      aria-selected={isActive}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => setActiveIndex(results.indexOf(item))}
                      onClick={() => choose(item)}
                      onKeyDown={(event) => { if (event.key === 'Enter') choose(item) }}
                      className={`ui-command-option ${isActive ? 'ui-command-option--active' : ''}`}
                    >
                      <item.icon size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          {results.length === 0 && <p className="ui-command-empty">{t('palette.noResults')}</p>}
          <p className="sr-only" aria-live="polite">{t('common:select.resultCount', { count: results.length })}</p>
          <p className="ui-command-hint">{t('palette.keyboardHint')}</p>
        </div>
      </div>
    </ModalPortal>
  )
}
