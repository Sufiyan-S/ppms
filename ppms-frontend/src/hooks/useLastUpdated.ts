import { useState, useEffect } from 'react'

function formatAgo(updatedAt: number, now: number): string {
  const secs = Math.floor((now - updatedAt) / 1000)
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
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!dataUpdatedAt) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [dataUpdatedAt])

  return dataUpdatedAt ? formatAgo(dataUpdatedAt, Math.max(now, dataUpdatedAt)) : ''
}
