import { useTranslation } from 'react-i18next'
import { formatNumberIn } from '../i18n/format'
import { periodChange } from '../utils/datePresets'

/**
 * "▲ 12.5% up vs previous period" under a total. Green when the change is good for the business, red when bad;
 * the arrow and the word carry the meaning too, so colour is never the only signal.
 */
export function PeriodChangeNote({ current, previous, higherIsBetter = true }: {
  current: number
  previous: number
  higherIsBetter?: boolean
}) {
  const { t } = useTranslation()
  const { direction, percent } = periodChange(current, previous)
  if (direction === 'same') {
    return <p className="mt-1 text-xs text-ink-3">{t('periodChange.noChange')}</p>
  }
  const isGood = (direction === 'up') === higherIsBetter
  const arrow = direction === 'up' ? '▲' : '▼'
  const words = percent === null
    ? t(direction === 'up' ? 'periodChange.upFromZero' : 'periodChange.downFromZero')
    : t(direction === 'up' ? 'periodChange.up' : 'periodChange.down', { percent: formatNumberIn(Math.abs(percent)) })
  return (
    <p className={`mt-1 text-xs font-medium ${isGood ? 'text-ok' : 'text-bad'}`}>
      <span aria-hidden="true">{arrow} </span>
      {words}
    </p>
  )
}
