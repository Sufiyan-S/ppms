import { useEffect, useState } from 'react'
import { Fuel } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PumpSummary } from '../../../api/pumpApi'
import NotificationBell from '../../../components/NotificationBell'
import { CommandPaletteLauncher } from './CommandPaletteLauncher'
import { DayProgressLine } from './DayProgressLine'
import { PumpSwitcher } from './PumpSwitcher'
import { TopBarClock } from './TopBarClock'
import { TopBarShiftChip } from './TopBarShiftChip'
import { readTopBarEntrancePlayed, storeTopBarEntrancePlayed } from './topBarEntrance'
import { UserProfileArea } from './UserProfileArea'

interface DashboardTopBarProps {
  /** Pumps the user may switch between; empty for staff, who work at one pump. */
  switchablePumps: PumpSummary[]
  pumpName: string | undefined
  /** The pump whose notifications and current shift the bar shows; null hides both. */
  notificationPumpId: number | null
}

/**
 * The 56px bar: brand and pump on the left, the clock and current shift truly centred, actions on the right.
 * Phones keep pump, bell and profile.
 */
export function DashboardTopBar({ switchablePumps, pumpName, notificationPumpId }: DashboardTopBarProps) {
  const { t } = useTranslation(['nav', 'common'])
  const canSwitchPump = switchablePumps.length > 0
  const [playEntrance] = useState(() => !readTopBarEntrancePlayed())

  useEffect(() => {
    if (playEntrance) storeTopBarEntrancePlayed()
  }, [playEntrance])

  return (
    <header className={`ui-dashboard-topbar print:hidden ${playEntrance ? 'ui-dashboard-topbar--entrance' : ''}`}>
      <div className="ui-dashboard-topbar-left">
        <div className="ui-dashboard-brandmark" aria-hidden="true">
          <Fuel size={18} className="text-ink" strokeWidth={1.8} />
        </div>
        <span className="ui-dashboard-brandname">PPMS</span>
        {canSwitchPump && <PumpSwitcher pumps={switchablePumps} />}
        <p className={`ui-dashboard-topbar-pump ${canSwitchPump ? 'ui-dashboard-topbar-pump--phone' : ''}`}>
          <span className="sr-only">{t('sidebar.currentPump')}: </span>
          <span key={pumpName} className="ui-dashboard-topbar-pump__name">{pumpName ?? t('common:notices.noPumpTitle')}</span>
        </p>
      </div>

      <div className="ui-dashboard-topbar-center">
        <TopBarClock />
        <TopBarShiftChip pumpId={notificationPumpId} />
      </div>

      <div className="ui-dashboard-topbar-right">
        <CommandPaletteLauncher />
        {notificationPumpId !== null && <NotificationBell pumpId={notificationPumpId} />}
        <UserProfileArea />
      </div>

      <DayProgressLine />
    </header>
  )
}
