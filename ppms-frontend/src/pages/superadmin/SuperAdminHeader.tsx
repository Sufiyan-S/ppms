import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Fuel } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'
import { authApi } from '../../api/authApi'
import { ChangePasswordModal } from '../../components/ChangePasswordModal'

export function SuperAdminHeader() {
  const { t } = useTranslation('superadmin')
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
    <header className="bg-ink px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-raised">
      <div className="flex items-center gap-3">
        <div className="ui-dashboard-brandmark select-none">
          <Fuel size={20} strokeWidth={1.8} className="text-ink" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold text-surface tracking-wide">PPMS</span>
            <span className="text-xs text-on-dark-2 font-medium border border-white/25 px-2 py-0.5 rounded-badge">
              {t('header.portal')}
            </span>
          </div>
          <p className="text-xs text-on-dark-2 italic mt-0.5 hidden sm:block">
            {t('header.tagline')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-xs font-semibold text-surface leading-tight">{user?.fullName}</p>
          <p className="text-xs text-on-dark-2 leading-tight">{t('header.role')}</p>
        </div>
        <div className="relative" ref={profileMenuRef}>
          <button
            onClick={() => setProfileMenuOpen((open) => !open)}
            className="ui-btn-icon w-9 h-9 bg-white/10 border border-white/25 rounded-full hover:bg-white/20 transition-colors"
            title={t('header.openProfileMenu')}
          >
            <span className="text-sm font-bold text-surface">
              {user?.fullName?.charAt(0).toUpperCase()}
            </span>
          </button>

          {profileMenuOpen && (
            <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-card border border-border bg-surface shadow-overlay">
              <button
                onClick={openPasswordModal}
                className="ui-btn ui-btn-ghost w-full justify-start rounded-none border-0 px-4 py-3 text-left text-sm font-medium text-ink hover:bg-bg"
              >
                {t('header.resetPassword')}
              </button>
              <button
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
                className="ui-btn ui-btn-ghost w-full justify-start rounded-none border-0 px-4 py-3 text-left text-sm font-medium text-bad hover:bg-bad-bg disabled:opacity-50"
              >
                {logoutMutation.isPending ? t('header.loggingOut') : t('header.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
      {passwordModalOpen && (
        <ChangePasswordModal
          onClose={() => setPasswordModalOpen(false)}
          successMessage={t('header.passwordUpdated')}
        />
      )}
    </>
  )
}
