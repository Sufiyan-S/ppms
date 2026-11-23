import { useTranslation } from 'react-i18next'
import { useNow } from '../../../hooks/useNow'
import { formatDateTimeIn } from '../../../i18n/format'

const TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }
const DATE_OPTIONS: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
const SPOKEN_OPTIONS: Intl.DateTimeFormatOptions = { ...DATE_OPTIONS, hour: 'numeric', minute: '2-digit', hour12: true }

/** Live pump time (IST) for the top bar; each digit that changes rolls in, so the clock reads as alive without distracting. */
export function TopBarClock() {
  const { t } = useTranslation('nav')
  const now = new Date(useNow(1000))
  const time = formatDateTimeIn(now, TIME_OPTIONS)
  const date = formatDateTimeIn(now, DATE_OPTIONS)

  return (
    <time className="ui-topbar-clock" dateTime={now.toISOString()}>
      <span className="sr-only">{t('topbar.currentTime', { value: formatDateTimeIn(now, SPOKEN_OPTIONS) })}</span>
      <span className="ui-topbar-clock__time" aria-hidden="true">
        {[...time].map((character, index) => (
          <span
            // Keyed by value so a changed digit remounts and plays its roll-in once.
            key={`${index}-${character}`}
            className={/\d/.test(character) ? 'ui-topbar-clock__digit' : character === ':' ? 'ui-topbar-clock__colon' : undefined}
          >
            {character}
          </span>
        ))}
      </span>
      <span className="ui-topbar-clock__date" aria-hidden="true">{date}</span>
    </time>
  )
}
