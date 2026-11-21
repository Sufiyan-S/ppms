import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Fuel } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { authApi } from '../../api/authApi'
import { ChangePasswordModal } from '../../components/ChangePasswordModal'

export function SuperAdminHeader() {
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await authApi.logout()
    },
    onSettled: () => {
      clearAuth()
      navigate('/login')
    },
  })

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const openPasswordModal = () => {
    setProfileMenuOpen(false)
    setPasswordModalOpen(true)
  }

  const handleLogout = () => {
    setProfileMenuOpen(false)
    logoutMutation.mutate()
  }

  return (
    <>
    <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-md">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-500/20 border border-indigo-400/30 rounded-xl flex items-center justify-center select-none">
          <Fuel size={20} strokeWidth={1.8} className="text-indigo-300" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold text-white tracking-wide">PPMS</span>
            <span className="text-xs text-indigo-300 font-medium border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 rounded-full">
              Super Admin Portal
            </span>
          </div>
          <p className="text-xs text-slate-400 italic mt-0.5 hidden sm:block">
            Platform management — onboard new pump owners
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-xs font-semibold text-white leading-tight">{user?.fullName}</p>
          <p className="text-xs text-indigo-300 leading-tight">Super Admin</p>
        </div>
        <div className="relative" ref={profileMenuRef}>
          <button
            onClick={() => setProfileMenuOpen((open) => !open)}
            className="w-9 h-9 bg-indigo-500/20 border border-indigo-400/40 rounded-full flex items-center justify-center hover:bg-indigo-500/30 transition-colors"
            title="Open profile menu"
          >
            <span className="text-sm font-bold text-indigo-200">
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
      {passwordModalOpen && (
        <ChangePasswordModal
          onClose={() => setPasswordModalOpen(false)}
          successMessage="Password updated successfully. Please log in with your new password."
        />
      )}
    </>
  )
}
