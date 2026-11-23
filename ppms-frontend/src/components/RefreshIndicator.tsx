import { useTranslation } from 'react-i18next'
import { useLastUpdated } from '../hooks/useLastUpdated'

interface RefreshIndicatorProps {
  /** True while TanStack Query is fetching in the background (isFetching) */
  isFetching: boolean
  /** Epoch ms from TanStack Query's dataUpdatedAt */
  dataUpdatedAt: number
}

/**
 * Shows a small pulsing dot while a query is fetching, and a "Updated X ago"
 * label otherwise. Designed to sit alongside a card/section title.
 */
export function RefreshIndicator({ isFetching, dataUpdatedAt }: RefreshIndicatorProps) {
  const { t } = useTranslation()
  const label = useLastUpdated(dataUpdatedAt)
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-3 select-none">
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors duration-300 ${
          isFetching ? 'bg-ok animate-pulse' : 'bg-control'
        }`}
      />
      {isFetching ? t('time.refreshing') : label ? t('time.updated', { ago: label }) : ''}
    </span>
  )
}
