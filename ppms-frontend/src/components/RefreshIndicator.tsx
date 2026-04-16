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
  const label = useLastUpdated(dataUpdatedAt)
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-400 select-none">
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors duration-300 ${
          isFetching ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'
        }`}
      />
      {isFetching ? 'Refreshing…' : label ? `Updated ${label}` : ''}
    </span>
  )
}
