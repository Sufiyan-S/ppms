import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Fuel, Menu } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { pumpApi } from '../../api/pumpApi'
import NotificationBell from '../../components/NotificationBell'
import { ToastContainer } from '../../components/Toast'
import { IconButton } from '../../components/IconButton'
import { DashboardSidebar, DASHBOARD_NAV_ID } from './layout/DashboardSidebar'
import { PumpSwitcher } from './layout/PumpSwitcher'
import { LiveClock } from './layout/LiveClock'
import { RouteOutlet } from './layout/RouteOutlet'
import { SuspendedPumpNotice } from './layout/SuspendedPumpNotice'
import { UserProfileArea } from './layout/UserProfileArea'

export default function DashboardPage() {
  const location  = useLocation()
  const { user } = useAuthStore()

  const { data: pumps = [] } = useQuery({ queryKey: ['myPumps'], queryFn: pumpApi.getMyPumps, staleTime: 5 * 60_000 })
  const sortedPumps = useMemo(
    () => [...pumps].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [pumps]
  )
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'

  const { selectedPumpId, suspendedPumpId, setSelectedPumpId } = usePumpStore()
  const selectedPumpSuspended = selectedPumpId !== null && selectedPumpId === suspendedPumpId
  const queryClient = useQueryClient()
  const [navOpen, setNavOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeNav = useCallback(() => {
    setNavOpen(false)
    menuButtonRef.current?.focus()
  }, [])

  // Initialise / validate the stored pump whenever the pump list loads.
  // If nothing is stored yet, or the stored pump no longer exists, default to the first pump.
  // A pump the server just reported as suspended stays selected so its notice is seen before switching.
  useEffect(() => {
    if (sortedPumps.length > 0 && !selectedPumpSuspended) {
      const valid = sortedPumps.find(p => p.id === selectedPumpId)
      if (!valid) setSelectedPumpId(sortedPumps[0].id)
    }
  }, [sortedPumps, selectedPumpId, selectedPumpSuspended, setSelectedPumpId])

  useEffect(() => {
    if (suspendedPumpId !== null) queryClient.invalidateQueries({ queryKey: ['myPumps'] })
  }, [suspendedPumpId, queryClient])

  // Move focus to main content on route change so screen readers announce the new page
  useEffect(() => {
    document.getElementById('main-content')?.focus()
  }, [location.pathname])

  return (
    <div className="ui-dashboard-shell h-screen bg-slate-50 flex flex-col overflow-hidden">

      {/* Skip link — visible only on keyboard focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-white focus:text-blue-700 focus:font-medium focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* ── Top header ─────────────────────────────────────────────────────────── */}
      <header className="ui-dashboard-topbar print:hidden">

        {/* ── Left: Logo + tagline ── */}
        <div className="ui-dashboard-topbar-left">
          <IconButton
            ref={menuButtonRef}
            label="Menu"
            className="ui-dashboard-menu-button"
            aria-expanded={navOpen}
            aria-controls={DASHBOARD_NAV_ID}
            onClick={() => setNavOpen(true)}
            icon={<Menu size={20} strokeWidth={2} />}
          />
          <div className="ui-dashboard-brandmark">
            <Fuel size={20} className="text-blue-300" strokeWidth={1.8} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-white tracking-wide">PPMS</span>
              <span className="text-xs text-blue-300 font-medium hidden sm:inline border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 rounded-full">
                Petrol Pump Management
              </span>
            </div>
            <p className="text-xs text-slate-400 italic hidden sm:block mt-0.5">
              Fuelling efficiency, every shift.
            </p>
          </div>
        </div>

        {/* ── Center: Live date/time + pump selector ── */}
        <div className="ui-dashboard-topbar-center">
          <LiveClock />
          {isOwnerOrAdmin && <PumpSwitcher pumps={sortedPumps} />}
        </div>

        {/* ── Right: Notification bell + User info + profile menu ── */}
        <div className="ui-dashboard-topbar-right">
          {selectedPumpId && !selectedPumpSuspended && <NotificationBell pumpId={selectedPumpId} />}
          <UserProfileArea />
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0" style={{ overflow: 'clip' }}>

        {/* ── Sidebar ── */}
        <DashboardSidebar
          pumpName={sortedPumps.find((pump) => pump.id === selectedPumpId)?.name}
          switchablePumps={isOwnerOrAdmin ? sortedPumps : []}
          drawerOpen={navOpen}
          onCloseDrawer={closeNav}
        />

        {/* ── Main content ── */}
        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 overflow-y-auto focus:outline-none">
          {selectedPumpSuspended
            ? <SuspendedPumpNotice canSwitchPump={isOwnerOrAdmin && sortedPumps.some(p => p.id !== selectedPumpId)} />
            : <RouteOutlet />}
        </main>
      </div>

      <ToastContainer />

    </div>
  )
}
