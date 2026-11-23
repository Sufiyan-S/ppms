import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Check, Pencil, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { authApi } from '../../../api/authApi'
import { useAuthStore } from '../../../store/authStore'
import { userApi } from '../../../api/userApi'
import { ChangePasswordModal } from '../../../components/ChangePasswordModal'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { useDensity } from '../../../hooks/useDensity'
import { IconButton } from '../../../components/IconButton'
import type { Density } from '../../../utils/density'
import { parseApiError } from '../../../utils/apiError'
import { roleLabel } from '../../../constants/labels'
import { LanguagePicker } from '../../../components/LanguagePicker'
import { activeLanguage } from '../../../i18n'
import type { AppLanguage } from '../../../i18n/languages'

const DENSITIES: Density[] = ['comfortable', 'compact']

export function UserProfileArea() {
  const { t } = useTranslation(['nav', 'common'])
  const navigate = useNavigate()
  const { user, clearAuth, updateUser } = useAuthStore()
  const [density, setDensity] = useDensity()

  // Inline name edit
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [languageError, setLanguageError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const profileButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEscapeKey(() => {
    setProfileMenuOpen(false)
    profileButtonRef.current?.focus()
  }, profileMenuOpen && !passwordModalOpen)

  const renameMutation = useMutation({
    mutationFn: (fullName: string) => userApi.updateMyProfile(fullName),
    onSuccess: (data) => {
      updateUser({ fullName: data.fullName })
      setEditingName(false)
      setNameError(null)
    },
    onError: (err) => {
      setNameError(parseApiError(err, t('profile.saveNameFailed')))
    },
  })

  // The screen switches at once; the choice goes back if the server could not save it.
  const languageMutation = useMutation({
    mutationFn: (language: AppLanguage) => userApi.updateMyLanguage(language),
    onMutate: (language) => {
      const previousLanguage = user?.preferredLanguage
      setLanguageError(null)
      updateUser({ preferredLanguage: language })
      return { previousLanguage }
    },
    onError: (err, _language, context) => {
      updateUser({ preferredLanguage: context?.previousLanguage })
      setLanguageError(parseApiError(err, t('common:language.saveFailed')))
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

  const startEditing = () => {
    setNameInput(user?.fullName ?? '')
    setNameError(null)
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.select(), 0)
  }

  const saveName = () => {
    const trimmed = nameInput.trim()
    if (!trimmed) { setNameError(t('profile.nameBlank')); return }
    renameMutation.mutate(trimmed)
  }

  const cancelEdit = () => {
    setEditingName(false)
    setNameError(null)
  }

  const openPasswordModal = () => {
    setProfileMenuOpen(false)
    setPasswordModalOpen(true)
  }

  const handleLogout = () => {
    setProfileMenuOpen(false)
    logoutMutation.mutate()
  }

  const nameBlock = editingName ? (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <input aria-label={t('profile.yourName')}
          ref={nameInputRef}
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveName()
            if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
          }}
          disabled={renameMutation.isPending}
          className="text-sm"
        />
        <IconButton label={t('profile.saveName')} onClick={saveName} disabled={renameMutation.isPending}
          icon={<Check size={14} strokeWidth={2.5} />} />
        <IconButton label={t('profile.cancelEditing')} onClick={cancelEdit} disabled={renameMutation.isPending}
          icon={<X size={14} strokeWidth={2} />} />
      </div>
      {nameError && <p role="alert" className="ui-error-text">{nameError}</p>}
    </div>
  ) : (
    <button
      type="button"
      onClick={startEditing}
      className="group flex w-full items-center gap-1 text-left text-sm font-semibold text-ink"
      aria-label={t('profile.editName', { name: user?.fullName ?? '' })}
      title={t('profile.editNameHint')}
    >
      <span className="truncate">{user?.fullName}</span>
      <Pencil size={12} strokeWidth={2} aria-hidden="true" className="shrink-0 text-ink-3 group-hover:text-primary" />
    </button>
  )

  return (
    <>
      <div className="relative" ref={profileMenuRef}>
        <button
          ref={profileButtonRef}
          onClick={() => setProfileMenuOpen((open) => !open)}
          aria-label={t('profile.openMenu')}
          aria-expanded={profileMenuOpen}
          aria-haspopup="true"
          className="ui-dashboard-avatar"
          title={t('profile.openMenu')}
        >
          <span className="text-sm font-bold text-surface">
            {user?.fullName?.charAt(0).toUpperCase()}
          </span>
        </button>

        {profileMenuOpen && (
          <div className="ui-profile-menu">
            <div className="border-b border-border px-4 py-3">
              {nameBlock}
              <p className="text-xs text-ink-3">{roleLabel(user?.role)}</p>
            </div>
            <LanguagePicker
              value={activeLanguage()}
              onChange={(language) => languageMutation.mutate(language)}
              disabled={languageMutation.isPending}
              error={languageError}
              className="border-b border-border px-4 py-3"
              selectClassName="text-sm"
            />
            <fieldset className="border-b border-border px-4 py-3">
              <legend className="ui-label">{t('profile.density')}</legend>
              <div className="flex flex-col gap-1">
                {DENSITIES.map((option) => (
                  <label key={option} className="flex min-h-8 items-center gap-2 text-sm text-ink">
                    <input type="radio" name="ppms-density" value={option} checked={density === option}
                      onChange={() => setDensity(option)} />
                    {option === 'compact' ? t('profile.densityCompact') : t('profile.densityComfortable')}
                  </label>
                ))}
              </div>
              <p className="ui-help">{t('profile.densityHint')}</p>
            </fieldset>
            <button
              onClick={openPasswordModal}
              className="ui-btn ui-btn-ghost w-full justify-start rounded-none border-0 px-4 py-3 text-left text-sm font-medium text-ink hover:bg-bg"
            >
              {t('profile.changePassword')}
            </button>
            <button
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              className="ui-btn ui-btn-ghost w-full justify-start rounded-none border-0 px-4 py-3 text-left text-sm font-medium text-bad hover:bg-bad-bg disabled:opacity-50"
            >
              {logoutMutation.isPending ? t('profile.loggingOut') : t('profile.logout')}
            </button>
          </div>
        )}
      </div>
      {passwordModalOpen && <ChangePasswordModal onClose={() => setPasswordModalOpen(false)} />}
    </>
  )
}
