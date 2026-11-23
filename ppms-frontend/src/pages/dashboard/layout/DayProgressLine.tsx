import { useNow } from '../../../hooks/useNow'
import { dayProgressFraction } from './shiftWindow'

/** A thin amber line along the bottom of the top bar that fills as the IST business day goes by. */
export function DayProgressLine() {
  const now = useNow(60_000)
  const percent = Math.round(dayProgressFraction(new Date(now)) * 10_000) / 100

  return (
    <span className="ui-topbar-day-progress" aria-hidden="true">
      <span className="ui-topbar-day-progress__fill" style={{ width: `${percent}%` }} />
    </span>
  )
}
