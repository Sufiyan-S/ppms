import { useTranslation } from 'react-i18next'
import type { StaffMember } from '../../../api/userApi'
import { IconButton } from '../../../components/IconButton'

interface Props {
  title: string
  showStepNumber: boolean
  operatorsLoading: boolean
  noneAvailable: boolean
  filteredOperators: StaffMember[]
  operatorSearch: string
  onSearchChange: (text: string) => void
  selectedOperatorId: number | null
  onSelect: (operatorId: number) => void
}

export function OperatorPicker({
  title, showStepNumber, operatorsLoading, noneAvailable, filteredOperators, operatorSearch, onSearchChange,
  selectedOperatorId, onSelect,
}: Props) {
  const { t } = useTranslation('shifts')
  return (
    <div>
      <span className="ui-label mb-2">
        {showStepNumber ? t('components.operatorPicker.stepTitle', { title }) : title}
      </span>
      {operatorsLoading ? (
        <p className="ui-empty">{t('components.operatorPicker.loading')}</p>
      ) : noneAvailable ? (
        <div className="ui-alert ui-alert-warning text-xs">
          {t('components.operatorPicker.noneAvailable')}
        </div>
      ) : (
        <div className="ui-card p-0 overflow-hidden">
          <div className="ui-search-shell border-b border-border bg-surface-sunken px-3 py-2">
            <svg className="ui-search-shell__icon" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
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
                  <button key={o.id} type="button"
                    onClick={() => onSelect(o.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${
                      isSelected ? 'bg-info-bg' : 'hover:bg-bg'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isSelected ? 'bg-primary text-on-primary' : 'bg-surface-sunken text-ink-2'
                    }`}>
                      {o.fullName.charAt(0).toUpperCase()}
                    </div>
                    <span className={`flex-1 font-medium ${isSelected ? 'text-info' : 'text-ink'}`}>
                      {o.fullName}
                    </span>
                    {isSelected && (
                      <svg className="w-4 h-4 text-info shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
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
