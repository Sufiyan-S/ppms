import { useEffect, useState } from 'react'
import { formatIstDateTime } from '../../../utils/date'

export function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const timeStr = formatIstDateTime(now, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  const dateStr = formatIstDateTime(now, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <>
      <span className="text-sm font-semibold text-white tabular-nums tracking-wide">{timeStr}</span>
      <span className="text-xs text-slate-400">{dateStr}</span>
    </>
  )
}
