import type { NavGroupId } from '../navItems'

const COLLAPSED_KEY = 'ppms_sidebar_collapsed'
const CLOSED_GROUPS_KEY = 'ppms_sidebar_closed_groups'
const GROUP_IDS: readonly NavGroupId[] = ['operations', 'money', 'reports', 'admin']

/** True or false once the user has chosen on this device; null until then, so the screen width decides. */
export function readSidebarCollapsed(): boolean | null {
  try {
    const value = localStorage.getItem(COLLAPSED_KEY)
    return value === 'true' ? true : value === 'false' ? false : null
  } catch {
    // Storage blocked (private mode): the screen width decides.
    return null
  }
}

export function storeSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed))
  } catch (error) {
    console.warn('Could not remember the sidebar layout on this device', error)
  }
}

export function readClosedNavGroups(): NavGroupId[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CLOSED_GROUPS_KEY) ?? '[]')
    return Array.isArray(parsed) ? GROUP_IDS.filter((id) => parsed.includes(id)) : []
  } catch {
    // Storage blocked or the saved value is unreadable: every group starts open.
    return []
  }
}

export function storeClosedNavGroups(groups: NavGroupId[]): void {
  try {
    localStorage.setItem(CLOSED_GROUPS_KEY, JSON.stringify(groups))
  } catch (error) {
    console.warn('Could not remember the closed sidebar groups on this device', error)
  }
}
