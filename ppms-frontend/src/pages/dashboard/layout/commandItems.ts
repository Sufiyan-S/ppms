import { BarChart2, Fuel, Gauge, HardHat, IndianRupee, Landmark, Package, ReceiptText, Truck, UserPlus, Wallet, Zap, type LucideIcon } from 'lucide-react'
import type { UserRole } from '../../../types/auth'
import { canAccessPage, canPerformAction } from '../../../permissions/permissions'
import { translateKey } from '../../../i18n'
import { navGroupsFor, navItemLabel } from '../navItems'

export interface CommandItem {
  id: string
  kind: 'page' | 'action'
  label: string
  path: string
  icon: LucideIcon
}

/**
 * Tasks the palette can start; each target page opens the task from ?action= in its address.
 * Without an action permission the page access alone decides (e.g. any role that sees balance sheets may generate one).
 */
const QUICK_ACTIONS: { id: string; action?: string; page: string; path: string; icon: LucideIcon }[] = [
  { id: 'openShift',         action: 'shift:open',                 page: 'shifts',        path: '/dashboard/shifts?action=open-shift',              icon: Zap },
  { id: 'recordDelivery',    action: 'inventory:record-delivery',  page: 'inventory',     path: '/dashboard/inventory?action=record-delivery',      icon: Truck },
  { id: 'dipCheck',          action: 'inventory:record-dip-check', page: 'inventory',     path: '/dashboard/inventory?action=dip-check',            icon: Gauge },
  { id: 'recordPayment',     action: 'credit:record-payment',      page: 'credit',        path: '/dashboard/credit?action=record-payment',          icon: IndianRupee },
  { id: 'recordSettlement',  action: 'settlement:write',           page: 'settlements',   path: '/dashboard/settlements?action=record-settlement',  icon: Landmark },
  { id: 'addExpense',        action: 'expense:create',             page: 'expenses',      path: '/dashboard/expenses?action=add-expense',           icon: ReceiptText },
  { id: 'cashEntry',         action: 'cash:record-event',          page: 'cashDrawer',    path: '/dashboard/cash?action=cash-entry',                icon: Wallet },
  { id: 'sellProduct',       action: 'product:record-sale',        page: 'products',      path: '/dashboard/ancillary?action=sell-product',         icon: Package },
  { id: 'generateSheet',                                           page: 'balanceSheets', path: '/dashboard/balance-sheets?action=generate-sheet',  icon: BarChart2 },
  { id: 'generatePayroll',   action: 'payroll:generate',           page: 'payroll',       path: '/dashboard/payroll?action=generate-payroll',       icon: HardHat },
  { id: 'setFuelPrices',                                           page: 'setup',         path: '/dashboard/setup?action=set-fuel-prices',          icon: Fuel },
  { id: 'addStaff',          action: 'setup:manage',               page: 'setup',         path: '/dashboard/setup?action=add-staff',                icon: UserPlus },
]

/** Every page the role can open, in sidebar order, then the quick actions the role may do. */
export function commandItemsFor(role: UserRole | undefined): CommandItem[] {
  const pages = navGroupsFor(role).flatMap(group => group.items).map<CommandItem>(item => ({
    id: `page-${item.page}`,
    kind: 'page',
    label: navItemLabel(item.page),
    path: item.path,
    icon: item.icon,
  }))
  const actions = QUICK_ACTIONS
    .filter(action => (!action.action || canPerformAction(action.action, role)) && canAccessPage(action.page, role))
    .map<CommandItem>(action => ({
      id: `action-${action.id}`,
      kind: 'action',
      label: translateKey(`nav:palette.actions.${action.id}`),
      path: action.path,
      icon: action.icon,
    }))
  return [...pages, ...actions]
}

export function filterCommandItems(items: CommandItem[], query: string): CommandItem[] {
  const search = query.trim().toLocaleLowerCase()
  return search ? items.filter(item => item.label.toLocaleLowerCase().includes(search)) : items
}
