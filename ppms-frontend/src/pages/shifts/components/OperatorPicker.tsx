import { Check, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { StaffMember } from '../../../api/userApi'
import { IconButton } from '../../../components/IconButton'

interface Props {
  title: string
  showStepNumber: boolean
  /** Off where a section heading above already names the picker; the search box keeps the title as its label. */
  showTitle?: boolean
  operatorsLoading: boolean
  noneAvailable: boolean
  filteredOperators: StaffMember[]
  operatorSearch: string
  onSearchChange: (text: string) => void
  selectedOperatorId: number | null
  onSelect: (operatorId: number) => void
}

export function OperatorPicker({
  title, showStepNumber, showTitle = true, operatorsLoading, noneAvailable, filteredOperators, operatorSearch, onSearchChange,
  selectedOperatorId, onSelect,
}: Props) {
  const { t } = useTranslation('shifts')
  return (
    <div>
      {showTitle && (
        <span className="ui-label mb-2">
          {showStepNumber ? t('components.operatorPicker.stepTitle', { title }) : title}
        </span>
      )}
      {operatorsLoading ? (
        <p className="ui-empty">{t('components.operatorPicker.loading')}</p>
      ) : noneAvailable ? (
        <div className="ui-alert ui-alert-warning text-xs">
          {t('components.operatorPicker.noneAvailable')}
        </div>
      ) : (
        <div className="ui-card p-0 overflow-hidden">
          <div className="ui-search-shell border-b border-border bg-surface-sunken px-3 py-2">
            <Search size={16} aria-hidden="true" className="ui-search-shell__icon" />
            <input aria-label={title} type="text" value={operatorSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('components.operatorPicker.searchPlaceholder')}
              className="ui-search-shell__input flex-1 text-sm" />
            {operatorSearch && (
              <IconButton onClick={() => onSearchChange('')}
                className="ui-search-shell__clear text-lg leading-none"
                label={t('components.operatorPicker.clearSearch')}
                icon={'×'}
              />
            )}
          </div>
          <div className="max-h-44 overflow-y-auto divide-y divide-border">
            {filteredOperators.length === 0 ? (
              <p className="ui-empty p-3">{t('components.operatorPicker.noMatch', { search: operatorSearch })}</p>
            ) : (
              filteredOperators.map((o) => {
                const isSelected = selectedOperatorId === o.id
                return (
                  <button key={o.id} type="button" aria-pressed={isSelected}
                    onClick={() => onSelect(o.id)}
                    className={`w-full min-h-11 flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left ${
                      isSelected ? 'bg-info-bg' : 'hover:bg-bg'
                    }`}
                  >
                    <span aria-hidden="true" className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isSelected ? 'bg-primary text-on-primary' : 'bg-surface-sunken text-ink-2'
                    }`}>
                      {o.fullName.charAt(0).toUpperCase()}
                    </span>
                    <span className={`flex-1 font-medium ${isSelected ? 'text-info' : 'text-ink'}`}>
                      {o.fullName}
                    </span>
                    {isSelected && (
                      <span aria-hidden="true" className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
