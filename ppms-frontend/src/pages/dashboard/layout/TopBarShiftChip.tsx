import { useQuery } from '@tanstack/react-query'
import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { shiftApi } from '../../../api/shiftApi'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import { useNow } from '../../../hooks/useNow'
import { useAuthStore } from '../../../store/authStore'
import type { UserRole } from '../../../types/auth'
import { findCurrentShiftWindow, splitRemaining } from './shiftWindow'

const ROLES_WITH_CHIP: UserRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']
// The open-shifts endpoint gives an operator only their own shifts, so a pump-wide count would mislead them.
const ROLES_WITH_OPEN_COUNT: UserRole[] = ['OWNER', 'ADMIN', 'MANAGER']

/** The pump's current shift window with time left, and for managers how many shifts are open; links to Shifts. */
export function TopBarShiftChip({ pumpId }: { pumpId: number | null }) {
  const { t } = useTranslation('nav')
  const role = useAuthStore((state) => state.user?.role)
  const now = useNow(60_000)
  const showChip = pumpId !== null && role !== undefined && ROLES_WITH_CHIP.includes(role)
  const showOpenCount = showChip && role !== undefined && ROLES_WITH_OPEN_COUNT.includes(role)

  const { data: definitions = [] } = useQuery({
    queryKey: ['shift-definitions-active', pumpId],
    queryFn: () => shiftDefinitionApi.getActive(pumpId!),
    enabled: showChip,
    staleTime: 5 * 60_000,
  })

  // Same key and fetcher as the Shifts and Overview pages; while one of them also watches the list, it does the polling.
  const { data: activeShifts } = useQuery({
    queryKey: ['activeShifts', pumpId],
    queryFn: () => shiftApi.getActiveShifts(pumpId!),
    enabled: showOpenCount,
    staleTime: 30_000,
    refetchInterval: (query) => (query.getObserversCount() > 1 ? false : 60_000),
  })

  const currentWindow = showChip ? findCurrentShiftWindow(definitions, new Date(now)) : null
  if (!currentWindow) return null

  const { hours, minutes } = splitRemaining(currentWindow.remainingMs)
  const remaining = hours === 0
    ? t('topbar.shift.minutes', { minutes })
    : minutes === 0 ? t('topbar.shift.hours', { hours }) : t('topbar.shift.hoursMinutes', { hours, minutes })
  const name = currentWindow.definition.name
  const openCount = activeShifts?.length
  const ShiftIcon = currentWindow.definition.isNightShift ? Moon : Sun
  const ringGap = Math.round((1 - currentWindow.elapsedFraction) * 1000) / 10

  return (
    <Link to="/dashboard/shifts" className="ui-topbar-shift">
      <span className="sr-only">
        {t('topbar.shift.summary', { name, value: remaining })}
        {showOpenCount && openCount !== undefined && ` ${t('topbar.shift.openSummary', { count: openCount })}`}
      </span>
      <span className="ui-topbar-shift__ring" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle className="ui-topbar-shift__ring-track" cx="12" cy="12" r="10" pathLength={100} />
          <circle
            className="ui-topbar-shift__ring-fill"
            cx="12" cy="12" r="10" pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={ringGap}
          />
        </svg>
        <ShiftIcon size={12} strokeWidth={2} className="ui-topbar-shift__icon" />
      </span>
      <span className="ui-topbar-shift__text" aria-hidden="true">
        <span className="ui-topbar-shift__name">{t('topbar.shift.name', { name })}</span>
        <span className="ui-topbar-shift__remaining"> · {t('topbar.shift.endsIn', { value: remaining })}</span>
      </span>
      {showOpenCount && openCount !== undefined && (
        <span className="ui-topbar-shift__live" aria-hidden="true">
          <span className={`ui-topbar-shift__dot ${openCount > 0 ? 'ui-topbar-shift__dot--live' : ''}`} />
          {t('topbar.shift.open', { count: openCount })}
        </span>
      )}
    </Link>
  )
}
