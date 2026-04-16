import { useState, useEffect } from 'react'

function formatAgo(updatedAt: number): string {
  const secs = Math.floor((Date.now() - updatedAt) / 1000)
  if (secs < 10) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

/**
 * Given a TanStack Query `dataUpdatedAt` timestamp (epoch ms), returns a
 * human-readable "X ago" label that refreshes every 30 seconds.
 */
export function useLastUpdated(dataUpdatedAt: number): string {
  const [label, setLabel] = useState(() => dataUpdatedAt ? formatAgo(dataUpdatedAt) : '')

  useEffect(() => {
    if (!dataUpdatedAt) return
    setLabel(formatAgo(dataUpdatedAt))
    const id = setInterval(() => setLabel(formatAgo(dataUpdatedAt)), 30_000)
    return () => clearInterval(id)
  }, [dataUpdatedAt])

  return label
}
