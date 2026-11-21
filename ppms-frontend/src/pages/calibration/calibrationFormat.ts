import { formatIstDateTime } from '../../utils/date'

export { formatIstDate as fmtDate } from '../../utils/date'

export function fmtDateTime(d: string) {
  return formatIstDateTime(d, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
