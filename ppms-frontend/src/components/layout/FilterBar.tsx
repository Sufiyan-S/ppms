import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface FilterBarProps {
  /** Names the group of filters for screen readers. */
  label: string
  /** Date presets, selects, search boxes and filter chips. */
  children: ReactNode
  onClearFilters?: () => void
  /** "Clear filters" shows only while a filter differs from its default. */
  hasActiveFilters?: boolean
  /** e.g. "23 shifts"; announced when it changes. */
  summary?: ReactNode
  className?: string
}

/** The row of filters above a list or table; wraps onto more lines on phones. */
export function FilterBar({ label, children, onClearFilters, hasActiveFilters = false, summary, className = '' }: FilterBarProps) {
  const { t } = useTranslation()
  return (
    <div role="group" aria-label={label} className={`ui-filter-bar ${className}`}>
      <div className="ui-filter-bar__controls">{children}</div>
      {onClearFilters && hasActiveFilters && (
        <button type="button" onClick={onClearFilters} className="ui-btn ui-btn-ghost ui-btn-compact">
          {t('actions.clearFilters')}
        </button>
      )}
      {summary && <p className="ui-filter-bar__summary" aria-live="polite">{summary}</p>}
    </div>
  )
}
