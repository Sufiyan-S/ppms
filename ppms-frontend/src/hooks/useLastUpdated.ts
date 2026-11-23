import { useState, useEffect } from 'react'
import { translateKey } from '../i18n'

function formatAgo(updatedAt: number, now: number): string {
  const secs = Math.floor((now - updatedAt) / 1000)
  if (secs < 10) return translateKey('common:time.justNow')
  if (secs < 60) return translateKey('common:time.secondsAgo', { value: secs })
  const mins = Math.floor(secs / 60)
  if (mins < 60) return translateKey('common:time.minutesAgo', { value: mins })
  return translateKey('common:time.hoursAgo', { value: Math.floor(mins / 60) })
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
