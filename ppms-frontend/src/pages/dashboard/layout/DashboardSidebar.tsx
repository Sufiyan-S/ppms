import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PumpSummary } from '../../../api/pumpApi'
import { IconButton } from '../../../components/IconButton'
import { TABLET_QUERY } from '../../../constants/breakpoints'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { useIsPhone } from '../../../hooks/useIsPhone'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useAuthStore } from '../../../store/authStore'
import { isNavPathActive, navGroupsFor, navItemLabel } from '../navItems'
import type { NavGroupId } from '../navItems'
import { PumpSwitcher } from './PumpSwitcher'
import { readClosedNavGroups, readSidebarCollapsed, storeClosedNavGroups, storeSidebarCollapsed } from './sidebarPreferences'

export const DASHBOARD_NAV_ID = 'dashboard-navigation'

interface DashboardSidebarProps {
  pumpName: string | undefined
  /** Pumps the user may switch between; shown inside the drawer on phones, where the top bar has no room. */
  switchablePumps: PumpSummary[]
  /** On phones the sidebar is a drawer; on wider screens it is always visible and this is ignored. */
  drawerOpen: boolean
  onCloseDrawer: () => void
}

/**
 * Pages in groups (Operations, Money, Reports, Admin) whose headers open and close them.
 * From tablet width up the whole sidebar folds to an icon rail; tablets start folded, and the choice is kept per device.
 */
export function DashboardSidebar({ pumpName, switchablePumps, drawerOpen, onCloseDrawer }: DashboardSidebarProps) {
  const { t } = useTranslation(['nav', 'common'])
  const location = useLocation()
  const { user } = useAuthStore()
  const navRef = useRef<HTMLElement>(null)
  const isPhone = useIsPhone()
  const isTablet = useMediaQuery(TABLET_QUERY)
  const [collapsedChoice, setCollapsedChoice] = useState(readSidebarCollapsed)
  const [closedGroups, setClosedGroups] = useState(readClosedNavGroups)
  const isRail = !isPhone && (collapsedChoice ?? isTablet)
  const groups = navGroupsFor(user?.role)

  useEscapeKey(onCloseDrawer, drawerOpen)

  useEffect(() => {
    if (drawerOpen) navRef.current?.querySelector<HTMLElement>('a[aria-current="page"], a')?.focus()
  }, [drawerOpen])

  const toggleRail = () => {
    setCollapsedChoice(!isRail)
    storeSidebarCollapsed(!isRail)
  }

  const toggleGroup = (id: NavGroupId) => {
    const next = closedGroups.includes(id) ? closedGroups.filter((closed) => closed !== id) : [...closedGroups, id]
    setClosedGroups(next)
    storeClosedNavGroups(next)
  }

  return (
    <>
      {drawerOpen && <div className="ui-dashboard-nav-backdrop print:hidden" onClick={onCloseDrawer} aria-hidden="true" />}
      <nav
        ref={navRef}
        id={DASHBOARD_NAV_ID}
        aria-label={t('sidebar.label')}
        className={`ui-dashboard-sidebar print:hidden ${drawerOpen ? 'ui-dashboard-sidebar--open' : ''} ${isRail ? 'ui-dashboard-sidebar--rail' : ''}`}
      >
        <div className="ui-dashboard-sidebar-head">
          <p className="ui-dashboard-sidebar-title">{t('sidebar.title')}</p>
          <IconButton label={t('sidebar.closeMenu')} onClick={onCloseDrawer} className="ui-btn ui-btn-ghost ui-dashboard-drawer-close"
            icon={<X size={18} strokeWidth={2} />} />
        </div>
        <div className="ui-dashboard-sidebar-pumps">
          <PumpSwitcher pumps={switchablePumps} variant="drawer" />
        </div>
        <div className="ui-dashboard-sidebar-groups">
          {groups.map((group) => {
            const isOpen = isRail || !closedGroups.includes(group.id)
            const listId = `${DASHBOARD_NAV_ID}-${group.id}`
            return (
              <div key={group.id} className="ui-nav-group">
                <button type="button" onClick={() => toggleGroup(group.id)} aria-expanded={isOpen} aria-controls={listId}
                  className="ui-nav-group__toggle">
                  <span>{t(`groups.${group.id}`)}</span>
                  <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className={`ui-accordion-arrow ${isOpen ? 'ui-accordion-arrow--open' : ''}`} />
                </button>
                <ul id={listId} hidden={!isOpen} className="ui-nav-group__list">
                  {group.items.map((item) => {
                    const isActive = isNavPathActive(item.path, location.pathname)
                    const label = navItemLabel(item.page)
                    return (
                      <li key={item.path}>
                        <Link
                          to={item.path}
                          onClick={onCloseDrawer}
                          aria-current={isActive ? 'page' : undefined}
                          title={isRail ? label : undefined}
                          className={`ui-dashboard-navlink ${isActive ? 'ui-dashboard-navlink--active' : ''}`}
                        >
                          <div className={`w-7 h-7 rounded-control flex items-center justify-center flex-shrink-0 ${item.bg}`}>
                            <item.icon size={14} strokeWidth={2} aria-hidden="true" className={item.color} />
                          </div>
                          <span className="ui-dashboard-navlink__label truncate">{label}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
        <div className="ui-dashboard-sidebar-foot">
          <p className="ui-dashboard-sidebar-foot-label">{t('sidebar.currentPump')}</p>
          <p className="ui-dashboard-sidebar-foot-value">
            {pumpName ?? t('common:notices.noPumpTitle')}
          </p>
        </div>
        {!isPhone && (
          <button type="button" onClick={toggleRail} aria-pressed={isRail} title={isRail ? t('sidebar.collapse') : undefined}
            className="ui-sidebar-collapse">
            {isRail
              ? <PanelLeftOpen size={18} strokeWidth={2} aria-hidden="true" />
              : <PanelLeftClose size={18} strokeWidth={2} aria-hidden="true" />}
            <span className="ui-dashboard-navlink__label">{t('sidebar.collapse')}</span>
          </button>
        )}
      </nav>
    </>
  )
}
