import { Bell, Clock, LayoutDashboard, ClipboardCheck, Zap, CalendarDays, Database, CreditCard, ReceiptText, FileText, Wallet, Wrench, HardHat, Package, ClipboardList, Landmark, BarChart2, TrendingUp, Settings, type LucideIcon } from 'lucide-react'
import type { UserRole } from '../../types/auth'
import { canAccessPage } from '../../permissions/permissions'
import { translateKey } from '../../i18n'

/** Each item's label is nav.json items.<page>; read it with navItemLabel(). */
export const ALL_NAV_ITEMS: { path: string; icon: LucideIcon; page: string; bg: string; color: string }[] = [
  { path: '/dashboard/my-shift',       icon: Clock,           page: 'myShift',       bg: 'bg-ok-bg', color: 'text-ok' },
  { path: '/dashboard',                icon: LayoutDashboard, page: 'overview',      bg: 'bg-info-bg',    color: 'text-primary'    },
  { path: '/dashboard/approvals',      icon: ClipboardCheck,  page: 'approvals',     bg: 'bg-warn-bg',     color: 'text-warn'        },
  { path: '/dashboard/shifts',         icon: Zap,             page: 'shifts',        bg: 'bg-ok-bg', color: 'text-ok' },
  { path: '/dashboard/shift-planning', icon: CalendarDays,    page: 'shiftPlanning', bg: 'bg-info-bg',  color: 'text-primary'  },
  { path: '/dashboard/inventory',      icon: Database,        page: 'inventory',     bg: 'bg-warn-bg',   color: 'text-warn'   },
  { path: '/dashboard/credit',         icon: CreditCard,      page: 'credit',        bg: 'bg-info-bg',    color: 'text-primary'    },
  { path: '/dashboard/expenses',       icon: ReceiptText,     page: 'expenses',      bg: 'bg-bad-bg',    color: 'text-bad'    },
  { path: '/dashboard/documents',      icon: FileText,        page: 'documents',     bg: 'bg-surface-sunken',   color: 'text-ink-2'   },
  { path: '/dashboard/cash',           icon: Wallet,          page: 'cashDrawer',    bg: 'bg-ok-bg',    color: 'text-ok'    },
  { path: '/dashboard/calibration',    icon: Wrench,          page: 'calibration',   bg: 'bg-warn-bg',  color: 'text-warn'  },
  { path: '/dashboard/payroll',        icon: HardHat,         page: 'payroll',       bg: 'bg-info-bg',  color: 'text-primary'  },
  { path: '/dashboard/ancillary',      icon: Package,         page: 'products',      bg: 'bg-ok-bg',    color: 'text-ok'    },
  { path: '/dashboard/audit',          icon: ClipboardList,   page: 'auditLog',      bg: 'bg-surface-sunken',    color: 'text-ink-3'    },
  { path: '/dashboard/settlements',    icon: Landmark,        page: 'settlements',   bg: 'bg-info-bg',  color: 'text-primary'  },
  { path: '/dashboard/balance-sheets', icon: BarChart2,       page: 'balanceSheets', bg: 'bg-info-bg',     color: 'text-primary'     },
  { path: '/dashboard/reports',        icon: TrendingUp,      page: 'reports',       bg: 'bg-ok-bg',   color: 'text-ok'   },
  { path: '/dashboard/setup',          icon: Settings,        page: 'setup',         bg: 'bg-surface-sunken',    color: 'text-ink-2'    },
  { path: '/dashboard/notifications',  icon: Bell,            page: 'notifications', bg: 'bg-info-bg',        color: 'text-primary'  },
]

export type NavItem = (typeof ALL_NAV_ITEMS)[number]

export type NavGroupId = 'operations' | 'money' | 'reports' | 'admin'

/** Sidebar groups in display order; each group's label is nav.json groups.<id>. */
const NAV_GROUP_PAGES: { id: NavGroupId; pages: string[] }[] = [
  { id: 'operations', pages: ['myShift', 'overview', 'shifts', 'shiftPlanning', 'inventory', 'cashDrawer', 'products', 'calibration', 'documents'] },
  { id: 'money',      pages: ['credit', 'settlements', 'expenses', 'approvals', 'payroll'] },
  { id: 'reports',    pages: ['reports', 'balanceSheets', 'auditLog'] },
  { id: 'admin',      pages: ['setup', 'notifications'] },
]

export interface NavGroup {
  id: NavGroupId
  items: NavItem[]
}

/** The sidebar groups holding only the pages this role can open; groups left empty are dropped. */
export function navGroupsFor(role: UserRole | undefined): NavGroup[] {
  return NAV_GROUP_PAGES
    .map(({ id, pages }) => ({
      id,
      items: pages
        .filter(page => canAccessPage(page, role))
        .flatMap(page => ALL_NAV_ITEMS.filter(item => item.page === page)),
    }))
    .filter(group => group.items.length > 0)
}

const BOTTOM_TAB_PAGES_BY_ROLE: Partial<Record<UserRole, string[]>> = {
  OPERATOR:   ['myShift', 'expenses', 'shiftPlanning'],
  MANAGER:    ['overview', 'shifts', 'inventory', 'cashDrawer'],
  OWNER:      ['overview', 'shifts', 'credit', 'reports'],
  ADMIN:      ['overview', 'shifts', 'credit', 'reports'],
  ACCOUNTANT: ['overview', 'credit', 'expenses'],
}

export interface BottomTab {
  label: string
  path: string
  icon: LucideIcon
}

/** The phone tab bar for a role, limited to pages the role can open; "More" is added by the bar itself. */
export function bottomTabsFor(role: UserRole | undefined): BottomTab[] {
  const pages = role ? BOTTOM_TAB_PAGES_BY_ROLE[role] ?? [] : []
  return pages
    .filter(page => canAccessPage(page, role))
    .flatMap(page => {
      const item = ALL_NAV_ITEMS.find(navItem => navItem.page === page)
      return item ? [{ label: translateKey(`nav:bottomTabs.${page}`), path: item.path, icon: item.icon }] : []
    })
}

export function navItemLabel(page: string): string {
  return translateKey(`nav:items.${page}`)
}

export function isNavPathActive(itemPath: string, pathname: string): boolean {
  return pathname === itemPath || (itemPath !== '/dashboard' && pathname.startsWith(itemPath))
}
