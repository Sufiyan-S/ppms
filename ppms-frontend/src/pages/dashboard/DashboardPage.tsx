import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Zap, CalendarDays, Database, CreditCard,
  ReceiptText, FileText, Wallet, Wrench, HardHat, Package,
  ClipboardList, Landmark, BarChart2, TrendingUp, Settings, Fuel,
  Check, X,
  type LucideIcon,
} from 'lucide-react'
import { authApi } from '../../api/authApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { userApi } from '../../api/userApi'
import { pumpApi } from '../../api/pumpApi'
import NotificationBell from '../../components/NotificationBell'
import { ToastContainer } from '../../components/Toast'
import { canAccessPage } from '../../permissions/permissions'
import { formatIstDateTime } from '../../utils/date'
import { PasswordInput } from '../../components/PasswordInput'
import { ModalPortal } from '../../components/ModalPortal'
import { parseApiError } from '../../utils/apiError'

const PASSWORD_POLICY_MESSAGE = 'Password must be at least 8 characters and include 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 symbol.'
const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/

const ALL_NAV_ITEMS: { label: string; path: string; icon: LucideIcon; page: string; bg: string; color: string }[] = [
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

export default function DashboardPage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { user, clearAuth, updateUser } = useAuthStore()

  const { data: pumps = [] } = useQuery({ queryKey: ['myPumps'], queryFn: pumpApi.getMyPumps, staleTime: 5 * 60_000 })
  const sortedPumps = useMemo(
    () => [...pumps].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [pumps]
  )
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'

  const { selectedPumpId, setSelectedPumpId } = usePumpStore()

  // Filter nav items to only those the logged-in role is allowed to access
  const NAV_ITEMS = ALL_NAV_ITEMS.filter(item => canAccessPage(item.page, user?.role))

  // Initialise / validate the stored pump whenever the pump list loads.
  // If nothing is stored yet, or the stored pump no longer exists, default to the first pump.
  useEffect(() => {
    if (sortedPumps.length > 0) {
      const valid = sortedPumps.find(p => p.id === selectedPumpId)
      if (!valid) setSelectedPumpId(sortedPumps[0].id)
    }
  }, [sortedPumps.length])

  // Live clock
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Inline name edit
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  const renameMutation = useMutation({
    mutationFn: (fullName: string) => userApi.updateMyProfile(fullName),
    onSuccess: (data) => {
      updateUser({ fullName: data.fullName })
      setEditingName(false)
      setNameError(null)
    },
    onError: (err: any) => {
      setNameError(parseApiError(err, 'Failed to save name'))
    },
  })

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await authApi.logout()
    },
    onSettled: () => {
      clearAuth()
      navigate('/login')
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(currentPassword, newPassword),
    onSuccess: (data) => {
      clearPasswordForm()
      clearAuth()
      navigate('/login', { state: { message: data.message } })
    },
    onError: (err: any) => {
      setPasswordError(parseApiError(err, 'Failed to update password.'))
    },
  })

  const startEditing = () => {
    setNameInput(user?.fullName ?? '')
    setNameError(null)
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.select(), 0)
  }

  const saveName = () => {
    const trimmed = nameInput.trim()
    if (!trimmed) { setNameError('Name cannot be blank'); return }
    renameMutation.mutate(trimmed)
  }

  const cancelEdit = () => {
    setEditingName(false)
    setNameError(null)
  }

  const clearPasswordForm = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError(null)
    setPasswordModalOpen(false)
  }

  const openPasswordModal = () => {
    setProfileMenuOpen(false)
    setPasswordError(null)
    setPasswordModalOpen(true)
  }

  const handleLogout = () => {
    setProfileMenuOpen(false)
    logoutMutation.mutate()
  }

  const handleChangePassword = () => {
    setPasswordError(null)

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('All password fields are required.')
      return
    }

    if (!PASSWORD_POLICY_REGEX.test(newPassword)) {
      setPasswordError(PASSWORD_POLICY_MESSAGE)
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirm password must match.')
      return
    }

    changePasswordMutation.mutate({ currentPassword, newPassword })
  }

  const timeStr = formatIstDateTime(now, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  const dateStr = formatIstDateTime(now, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

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
          <span className="text-sm font-semibold text-white tabular-nums tracking-wide">{timeStr}</span>
          <span className="text-xs text-slate-400">{dateStr}</span>
          {isOwnerOrAdmin && sortedPumps.length > 0 && (
            <div className="ui-dashboard-pump-switcher">
              {sortedPumps.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPumpId(p.id)}
                  aria-label={`Switch to ${p.name}`}
                  aria-pressed={selectedPumpId === p.id}
                  className={`ui-dashboard-pump-chip cursor-pointer ${
                    selectedPumpId === p.id
                      ? 'ui-dashboard-pump-chip--active'
                      : ''
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Notification bell + User info + profile menu ── */}
        <div className="ui-dashboard-topbar-right">
          {selectedPumpId && <NotificationBell pumpId={selectedPumpId} />}
          <div className="text-right hidden sm:block">
            {editingName ? (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                  <input
                    ref={nameInputRef}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelEdit() }}
                    disabled={renameMutation.isPending}
                    className="text-xs font-semibold bg-white/10 text-white border border-white/30 rounded px-2 py-0.5 w-36 focus:outline-none focus:border-blue-400"
                    autoFocus
                  />
                  <button
                    onClick={saveName}
                    disabled={renameMutation.isPending}
                    aria-label="Save name"
                    className="text-green-400 hover:text-green-300 p-0.5 disabled:opacity-50"
                    title="Save"
                  ><Check size={13} strokeWidth={2.5} /></button>
                  <button
                    onClick={cancelEdit}
                    disabled={renameMutation.isPending}
                    aria-label="Cancel editing"
                    className="text-slate-400 hover:text-slate-200 p-0.5 disabled:opacity-50"
                    title="Cancel"
                  ><X size={13} strokeWidth={2} /></button>
                </div>
                {nameError && <p className="text-red-400 text-xs">{nameError}</p>}
              </div>
            ) : (
              <button
                onClick={startEditing}
                className="group text-right"
                title="Click to edit your name"
              >
                <p className="text-xs font-semibold text-white leading-tight group-hover:text-blue-200 transition-colors">
                  {user?.fullName}
                  <span className="ml-1 text-white/30 group-hover:text-blue-300 text-xs">✎</span>
                </p>
              </button>
            )}
            <p className="text-xs text-blue-300 leading-tight capitalize">{user?.role?.toLowerCase()}</p>
          </div>
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setProfileMenuOpen((open) => !open)}
              aria-label="Open profile menu"
              aria-expanded={profileMenuOpen}
              aria-haspopup="true"
              className="w-9 h-9 bg-blue-500/20 border border-blue-400/40 rounded-full flex items-center justify-center hover:bg-blue-500/30 transition-colors"
              title="Open profile menu"
            >
              <span className="text-sm font-bold text-blue-200">
                {user?.fullName?.charAt(0).toUpperCase()}
              </span>
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <button
                  onClick={openPasswordModal}
                  className="ui-btn ui-btn-ghost w-full justify-start rounded-none border-0 px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Reset Password
                </button>
                <button
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                  className="ui-btn ui-btn-ghost w-full justify-start rounded-none border-0 px-4 py-3 text-left text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0" style={{ overflow: 'clip' }}>

        {/* ── Sidebar ── */}
        <nav className="ui-dashboard-sidebar print:hidden">
          <div className="ui-dashboard-sidebar-head">
            <p className="ui-dashboard-sidebar-title">Navigation</p>
            <p className="ui-dashboard-sidebar-subtitle">
              {user?.role?.replace('_', ' ')} workspace
            </p>
          </div>
          <div className="px-3 py-3 flex-1">
            {NAV_ITEMS.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (item.path !== '/dashboard' && location.pathname.startsWith(item.path))
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={isActive ? 'page' : undefined}
                  className={`ui-dashboard-navlink ${
                    isActive
                      ? 'ui-dashboard-navlink--active'
                      : ''
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${item.bg}`}>
                    <item.icon size={14} strokeWidth={2} className={item.color} />
                  </div>
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
          <div className="ui-dashboard-sidebar-foot">
            <p className="ui-dashboard-sidebar-foot-label">Current pump</p>
            <p className="ui-dashboard-sidebar-foot-value">
              {sortedPumps.find((pump) => pump.id === selectedPumpId)?.name ?? 'No pump selected'}
            </p>
          </div>
        </nav>

        {/* ── Main content ── */}
        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 overflow-y-auto focus:outline-none">
          <div key={location.pathname} className="ui-route-fade">
            <Outlet />
          </div>
        </main>
      </div>

      <ToastContainer />

      {passwordModalOpen && (
        <ModalPortal>
        <div className="ui-modal-backdrop" onClick={clearPasswordForm}>
          <div
            className="ui-modal-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ui-modal-header ui-modal-header--themed ui-modal-header--warning">
              <div className="ui-modal-heading">
                <h2 className="ui-modal-title">Reset Password</h2>
                <p className="ui-modal-subtitle">Update your password, then sign in again.</p>
              </div>
              <button onClick={clearPasswordForm} aria-label="Close" className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
            </div>

            <div className="ui-modal-body space-y-4">
              <div>
                <label className="ui-label">Current Password</label>
                <PasswordInput
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  className="shadow-sm"
                />
              </div>

              <div>
                <label className="ui-label">New Password</label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="shadow-sm"
                />
                <p className="ui-help">{PASSWORD_POLICY_MESSAGE}</p>
              </div>

              <div>
                <label className="ui-label">Confirm New Password</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword() }}
                  autoComplete="new-password"
                  className="shadow-sm"
                />
              </div>

              {passwordError && (
                <div className="ui-alert ui-alert-danger" role="alert">
                  <p className="text-sm text-red-600">{passwordError}</p>
                </div>
              )}
            </div>

            <div className="ui-modal-footer">
              <button
                onClick={clearPasswordForm}
                disabled={changePasswordMutation.isPending}
                className="ui-btn ui-btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                disabled={changePasswordMutation.isPending}
                className="ui-btn ui-btn-primary"
              >
                {changePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}
