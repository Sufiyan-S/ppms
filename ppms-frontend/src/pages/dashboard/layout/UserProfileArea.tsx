import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { authApi } from '../../../api/authApi'
import { useAuthStore } from '../../../store/authStore'
import { userApi } from '../../../api/userApi'
import { ChangePasswordModal } from '../../../components/ChangePasswordModal'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { parseApiError } from '../../../utils/apiError'

export function UserProfileArea() {
  const navigate = useNavigate()
  const { user, clearAuth, updateUser } = useAuthStore()

  // Inline name edit
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
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
      <div className="text-right hidden sm:block">
        {editingName ? (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <input aria-label="Your name"
                ref={nameInputRef}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelEdit() }}
                disabled={renameMutation.isPending}
                className="text-xs font-semibold bg-white/10 text-white border border-white/30 rounded px-2 py-0.5 w-36 focus:outline-none focus:border-blue-400"
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
            aria-label={`Edit your name, ${user?.fullName ?? ''}`}
            title="Click to edit your name"
          >
            <p className="text-xs font-semibold text-white leading-tight group-hover:text-blue-200 transition-colors">
              {user?.fullName}
              <span aria-hidden="true" className="ml-1 text-white/30 group-hover:text-blue-300 text-xs">✎</span>
            </p>
          </button>
        )}
        <p className="text-xs text-blue-300 leading-tight capitalize">{user?.role?.toLowerCase()}</p>
      </div>
      <div className="relative" ref={profileMenuRef}>
        <button
          ref={profileButtonRef}
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
      {passwordModalOpen && <ChangePasswordModal onClose={() => setPasswordModalOpen(false)} />}
    </>
  )
}
