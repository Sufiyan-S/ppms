import { useSearchParams } from 'react-router-dom'
import { todayIso, yesterdayIso } from './reportFormat'

export interface ReportRange {
  from: string
  to: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function dateParam(value: string | null): string | null {
  return value && ISO_DATE.test(value) ? value : null
}

/**
 * The report date range kept in the URL (?from=&to=), so it survives tab switches, refresh and Back.
 * The third value is true while no range is in the URL and the default range is shown.
 */
export function useReportRange(defaultRange: () => ReportRange): [ReportRange, (range: ReportRange) => void, boolean] {
  const [searchParams, setSearchParams] = useSearchParams()
  const from = dateParam(searchParams.get('from'))
  const to = dateParam(searchParams.get('to'))
  const isDefault = !(from && to)
  const range = from && to ? { from, to } : defaultRange()

  const setRange = (next: ReportRange) => {
    setSearchParams((params) => {
      const updated = new URLSearchParams(params)
      updated.set('from', next.from)
      updated.set('to', next.to)
      return updated
    }, { replace: true })
  }

  return [range, setRange, isDefault]
}

export function yesterdayToTodayRange(): ReportRange {
  return { from: yesterdayIso(), to: todayIso() }
}
