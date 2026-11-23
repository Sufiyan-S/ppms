import { ALL_NAV_ITEMS, navItemLabel } from '../pages/dashboard/navItems'
import { translateKey } from '../i18n'

const APP_NAME = 'PPMS'

/** Keys under nav.json pageTitles. */
const OTHER_PAGE_TITLE_KEYS: Record<string, string> = {
  '/dashboard/notifications': 'notifications',
  '/login':                   'login',
  '/forgot-password':         'forgotPassword',
  '/reset-password':          'resetPassword',
  '/change-password':         'changePassword',
  '/super-admin':             'superAdmin',
  '/portal/credit-balance':   'creditBalance',
}

/** "Credit · PPMS" for the page at this path; nested pages such as /dashboard/credit/12 take their section's name. */
export function pageTitleFor(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const otherTitleKey = OTHER_PAGE_TITLE_KEYS[path]
  const navItem = ALL_NAV_ITEMS.find((item) => item.path === path)
    ?? ALL_NAV_ITEMS.find((item) => item.path !== '/dashboard' && path.startsWith(`${item.path}/`))
  const name = otherTitleKey ? translateKey(`nav:pageTitles.${otherTitleKey}`) : navItem ? navItemLabel(navItem.page) : undefined
  return name ? `${name} · ${APP_NAME}` : APP_NAME
}
