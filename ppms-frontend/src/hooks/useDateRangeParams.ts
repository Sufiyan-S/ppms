import { useSearchParams } from 'react-router-dom'
import type { DateRange } from '../utils/datePresets'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * A from/to filter kept in the address (?from=&to=) so presets, refresh and Back keep it.
 * Without the parameters the defaults apply; an empty parameter means the user cleared that date.
 */
export function useDateRangeParams(defaultRange: () => DateRange): [DateRange, (range: DateRange) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const read = (name: 'from' | 'to', fallback: () => string) => {
    const value = searchParams.get(name)
    if (value === null) return fallback()
    return ISO_DATE.test(value) ? value : ''
  }
  const range = {
    from: read('from', () => defaultRange().from),
    to: read('to', () => defaultRange().to),
  }

  const setRange = (next: DateRange) => {
    setSearchParams((params) => {
      const updated = new URLSearchParams(params)
      updated.set('from', next.from)
      updated.set('to', next.to)
      return updated
    }, { replace: true })
  }

  return [range, setRange]
}
