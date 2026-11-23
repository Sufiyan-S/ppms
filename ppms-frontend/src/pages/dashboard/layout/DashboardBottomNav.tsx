import type { Ref } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../../store/authStore'
import { bottomTabsFor, isNavPathActive } from '../navItems'
import { DASHBOARD_NAV_ID } from './DashboardSidebar'

interface DashboardBottomNavProps {
  drawerOpen: boolean
  onOpenDrawer: () => void
  moreButtonRef: Ref<HTMLButtonElement>
}

/** Phone-only tab bar; the full page list stays in the drawer behind "More". */
export function DashboardBottomNav({ drawerOpen, onOpenDrawer, moreButtonRef }: DashboardBottomNavProps) {
  const { t } = useTranslation('nav')
  const { pathname } = useLocation()
  const role = useAuthStore((state) => state.user?.role)
  const tabs = bottomTabsFor(role)
  const onTabPage = tabs.some((tab) => isNavPathActive(tab.path, pathname))

  return (
    <nav aria-label={t('bottomTabs.label')} className="ui-bottom-nav print:hidden">
      <ul className="ui-bottom-nav-list">
        {tabs.map((tab) => {
          const isActive = isNavPathActive(tab.path, pathname)
          return (
            <li key={tab.path} className="ui-bottom-nav-cell">
              <Link
                to={tab.path}
                aria-current={isActive ? 'page' : undefined}
                className={`ui-bottom-nav-item ${isActive ? 'ui-bottom-nav-item--active' : ''}`}
              >
                <tab.icon size={20} strokeWidth={2} aria-hidden="true" />
                <span>{tab.label}</span>
              </Link>
            </li>
          )
        })}
        <li className="ui-bottom-nav-cell">
          <button
            ref={moreButtonRef}
            type="button"
            aria-expanded={drawerOpen}
            aria-controls={DASHBOARD_NAV_ID}
            onClick={onOpenDrawer}
            className={`ui-bottom-nav-item ${onTabPage ? '' : 'ui-bottom-nav-item--active'}`}
          >
            <Menu size={20} strokeWidth={2} aria-hidden="true" />
            <span>{t('bottomTabs.more')}</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
