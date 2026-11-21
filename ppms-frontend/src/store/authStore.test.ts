import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '../types/auth'
import { queryClient } from '../queryClient'
import { useAuthStore } from './authStore'
import { usePumpStore } from './usePumpStore'

const owner: AuthUser = { userId: 1, fullName: 'Owner One', role: 'OWNER', assignedPumpId: null }

function storedValue(userId: number | null) {
  return JSON.stringify({ state: { user: userId === null ? null : { ...owner, userId } }, version: 0 })
}

function dispatchStorage(key: string, newValue: string | null) {
  window.dispatchEvent(new StorageEvent('storage', { key, newValue }))
}

describe('authStore', () => {
  const reload = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('location', { ...window.location, reload })
    reload.mockReset()
    useAuthStore.setState({ user: null, isAuthenticated: false })
    usePumpStore.setState({ selectedPumpId: null })
    queryClient.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('signs in and persists only the profile fields', () => {
    useAuthStore.getState().setAuth({ ...owner, phoneNumber: '9999999999' } as AuthUser)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    const persisted = JSON.parse(localStorage.getItem('ppms_user') ?? '{}')
    expect(persisted.state.user).toEqual(owner)
    expect(persisted.state).not.toHaveProperty('isAuthenticated')
  })

  it('clears cached queries when a new user signs in', () => {
    queryClient.setQueryData(['credit-ledger', 1], ['previous user data'])
    useAuthStore.getState().setAuth(owner)
    expect(queryClient.getQueryData(['credit-ledger', 1])).toBeUndefined()
  })

  it('on logout clears the user, the query cache and the selected pump', () => {
    useAuthStore.getState().setAuth(owner)
    usePumpStore.getState().setSelectedPumpId(7)
    queryClient.setQueryData(['activeShifts', 7], ['shift'])

    useAuthStore.getState().clearAuth()

    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false })
    expect(usePumpStore.getState().selectedPumpId).toBeNull()
    expect(queryClient.getQueryData(['activeShifts', 7])).toBeUndefined()
  })

  it('merges profile updates into the signed-in user and ignores them when signed out', () => {
    useAuthStore.getState().updateUser({ fullName: 'Nobody' })
    expect(useAuthStore.getState().user).toBeNull()

    useAuthStore.getState().setAuth(owner)
    useAuthStore.getState().updateUser({ fullName: 'Owner Renamed' })
    expect(useAuthStore.getState().user).toEqual({ ...owner, fullName: 'Owner Renamed' })
  })

  it('reloads when another tab signs in as a different user', () => {
    useAuthStore.getState().setAuth(owner)
    dispatchStorage('ppms_user', storedValue(2))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('reloads when another tab logs out', () => {
    useAuthStore.getState().setAuth(owner)
    dispatchStorage('ppms_user', storedValue(null))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('reloads when the stored value is removed or unreadable while signed in', () => {
    useAuthStore.getState().setAuth(owner)
    dispatchStorage('ppms_user', null)
    dispatchStorage('ppms_user', '{not json')
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload when another tab writes the same user', () => {
    useAuthStore.getState().setAuth(owner)
    dispatchStorage('ppms_user', storedValue(1))
    expect(reload).not.toHaveBeenCalled()
  })

  it('ignores changes to other storage keys', () => {
    useAuthStore.getState().setAuth(owner)
    dispatchStorage('ppms_selected_pump', '{}')
    expect(reload).not.toHaveBeenCalled()
  })
})
