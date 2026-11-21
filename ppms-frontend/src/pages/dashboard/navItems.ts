import { LayoutDashboard, Zap, CalendarDays, Database, CreditCard, ReceiptText, FileText, Wallet, Wrench, HardHat, Package, ClipboardList, Landmark, BarChart2, TrendingUp, Settings, type LucideIcon } from 'lucide-react'

export const ALL_NAV_ITEMS: { label: string; path: string; icon: LucideIcon; page: string; bg: string; color: string }[] = [
  { label: 'Overview',       path: '/dashboard',                icon: LayoutDashboard, page: 'overview',      bg: 'bg-blue-100',    color: 'text-blue-600'    },
  { label: 'Shifts',         path: '/dashboard/shifts',         icon: Zap,             page: 'shifts',        bg: 'bg-emerald-100', color: 'text-emerald-600' },
  { label: 'Shift Planning', path: '/dashboard/shift-planning', icon: CalendarDays,    page: 'shiftPlanning', bg: 'bg-violet-100',  color: 'text-violet-600'  },
  { label: 'Inventory',      path: '/dashboard/inventory',      icon: Database,        page: 'inventory',     bg: 'bg-amber-100',   color: 'text-amber-600'   },
  { label: 'Credit',         path: '/dashboard/credit',         icon: CreditCard,      page: 'credit',        bg: 'bg-cyan-100',    color: 'text-cyan-600'    },
  { label: 'Expenses',       path: '/dashboard/expenses',       icon: ReceiptText,     page: 'expenses',      bg: 'bg-rose-100',    color: 'text-rose-600'    },
  { label: 'Documents',      path: '/dashboard/documents',      icon: FileText,        page: 'documents',     bg: 'bg-slate-100',   color: 'text-slate-600'   },
  { label: 'Cash Drawer',    path: '/dashboard/cash',           icon: Wallet,          page: 'cashDrawer',    bg: 'bg-lime-100',    color: 'text-lime-700'    },
  { label: 'Calibration',    path: '/dashboard/calibration',    icon: Wrench,          page: 'calibration',   bg: 'bg-orange-100',  color: 'text-orange-600'  },
  { label: 'Payroll',        path: '/dashboard/payroll',        icon: HardHat,         page: 'payroll',       bg: 'bg-purple-100',  color: 'text-purple-600'  },
  { label: 'Products',       path: '/dashboard/ancillary',      icon: Package,         page: 'products',      bg: 'bg-teal-100',    color: 'text-teal-600'    },
  { label: 'Audit Log',      path: '/dashboard/audit',          icon: ClipboardList,   page: 'auditLog',      bg: 'bg-zinc-100',    color: 'text-zinc-500'    },
  { label: 'Settlements',    path: '/dashboard/settlements',    icon: Landmark,        page: 'settlements',   bg: 'bg-indigo-100',  color: 'text-indigo-600'  },
  { label: 'Balance Sheets', path: '/dashboard/balance-sheets', icon: BarChart2,       page: 'balanceSheets', bg: 'bg-sky-100',     color: 'text-sky-600'     },
  { label: 'Reports',        path: '/dashboard/reports',        icon: TrendingUp,      page: 'reports',       bg: 'bg-green-100',   color: 'text-green-700'   },
  { label: 'Setup',          path: '/dashboard/setup',          icon: Settings,        page: 'setup',         bg: 'bg-gray-100',    color: 'text-gray-600'    },
]
