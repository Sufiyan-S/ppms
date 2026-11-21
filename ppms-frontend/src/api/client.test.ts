import { AxiosError } from 'axios'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../store/authStore'
import { usePumpStore } from '../store/usePumpStore'
import apiClient from './client'

function refuseWith(status: number, message: string) {
  return (config: InternalAxiosRequestConfig) =>
    Promise.reject(new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
      status, statusText: '', headers: {}, config, data: { message },
    }))
}

describe('apiClient suspended pump handling', () => {
  beforeEach(() => usePumpStore.setState({ selectedPumpId: 4, suspendedPumpId: null }))

  it('remembers the pump from the URL when the server says it is suspended', async () => {
    await expect(apiClient.get('/pumps/7/shifts/active', { adapter: refuseWith(403, 'Pump is suspended') })).rejects.toThrow()
    expect(usePumpStore.getState().suspendedPumpId).toBe(7)
  })

  it('falls back to the selected pump when the URL carries the pump as a parameter', async () => {
    await expect(apiClient.get('/users/staff?pumpId=4', { adapter: refuseWith(403, 'Pump is suspended') })).rejects.toThrow()
    expect(usePumpStore.getState().suspendedPumpId).toBe(4)
  })

  it('does not treat an ordinary forbidden answer as a suspension', async () => {
    await expect(apiClient.get('/pumps/7/payroll', { adapter: refuseWith(403, 'Access denied') })).rejects.toThrow()
    expect(usePumpStore.getState().suspendedPumpId).toBeNull()
  })
})

describe('apiClient session refresh', () => {
  const originalAdapter = apiClient.defaults.adapter
  let refreshCalls: number
  let refreshSucceeds: boolean
  let sessionRenewed: boolean

  function respond(config: InternalAxiosRequestConfig, status: number, data: unknown = {}): Promise<AxiosResponse> {
    const response = { status, statusText: '', headers: {}, config, data }
    if (status >= 400) {
      return Promise.reject(new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, response))
    }
    return Promise.resolve(response)
  }

  function fakeServer(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
    if (config.url === '/auth/refresh') {
      refreshCalls += 1
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          sessionRenewed = refreshSucceeds
          respond(config, refreshSucceeds ? 200 : 401, { userId: 1 }).then(resolve, reject)
        }, 0)
      })
    }
    return respond(config, sessionRenewed ? 200 : 401, { url: config.url })
  }

  function installLocks(beforeGrant: () => void = () => undefined) {
    let queue: Promise<unknown> = Promise.resolve()
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => {
      const granted = queue.then(() => {
        beforeGrant()
        return task()
      })
      queue = granted.then(() => undefined, () => undefined)
      return granted
    })
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
    return request
  }

  function removeLocks() {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true })
  }

  beforeEach(() => {
    removeLocks()
    refreshCalls = 0
    refreshSucceeds = true
    sessionRenewed = false
    apiClient.defaults.adapter = fakeServer
    vi.stubGlobal('location', { ...window.location, href: '' })
    useAuthStore.setState({
      user: { userId: 1, fullName: 'Owner One', role: 'OWNER', assignedPumpId: null },
      isAuthenticated: true,
    })
  })

  afterEach(() => {
    removeLocks()
    apiClient.defaults.adapter = originalAdapter
    vi.unstubAllGlobals()
    useAuthStore.setState({ user: null, isAuthenticated: false })
  })

  it('renews the session once and replays the request that got a 401', async () => {
    const response = await apiClient.get('/pumps')

    expect(response.data).toEqual({ url: '/pumps' })
    expect(refreshCalls).toBe(1)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(window.location.href).toBe('')
  })

  it('shares one refresh between requests that fail at the same time', async () => {
    const responses = await Promise.all([apiClient.get('/pumps'), apiClient.get('/notifications')])

    expect(responses.map((response) => response.data.url)).toEqual(['/pumps', '/notifications'])
    expect(refreshCalls).toBe(1)
  })

  it('signs out when the refresh is refused', async () => {
    refreshSucceeds = false

    await expect(apiClient.get('/pumps')).rejects.toMatchObject({ response: { status: 401 } })

    expect(refreshCalls).toBe(1)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(window.location.href).toBe('/login?reason=session_expired')
  })

  it('signs out when the replayed request is refused again', async () => {
    apiClient.defaults.adapter = (config) => {
      if (config.url === '/auth/refresh') {
        refreshCalls += 1
        return respond(config, 200)
      }
      return respond(config, 401)
    }

    await expect(apiClient.get('/pumps')).rejects.toMatchObject({ response: { status: 401 } })

    expect(refreshCalls).toBe(1)
    expect(window.location.href).toBe('/login?reason=session_expired')
  })

  it.each(['/auth/login', '/auth/logout'])('never tries to refresh for %s', async (url) => {
    await expect(apiClient.post(url)).rejects.toMatchObject({ response: { status: 401 } })

    expect(refreshCalls).toBe(0)
  })

  it('does not refresh when nobody is signed in', async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false })

    await expect(apiClient.get('/pumps')).rejects.toMatchObject({ response: { status: 401 } })

    expect(refreshCalls).toBe(0)
  })

  it('renews the session inside the cross-tab lock when the browser has one', async () => {
    const request = installLocks()

    const responses = await Promise.all([apiClient.get('/pumps'), apiClient.get('/notifications')])

    expect(responses.map((response) => response.data.url)).toEqual(['/pumps', '/notifications'])
    expect(request).toHaveBeenCalledWith('ppms-session-refresh', expect.any(Function))
    expect(refreshCalls).toBe(1)
    expect(Number(localStorage.getItem('ppms_last_refresh_at'))).toBeGreaterThan(0)
  })

  it('replays without refreshing when another tab refreshed while this one waited for the lock', async () => {
    installLocks(() => {
      sessionRenewed = true
      localStorage.setItem('ppms_last_refresh_at', String(Date.now()))
    })

    const response = await apiClient.get('/pumps')

    expect(response.data).toEqual({ url: '/pumps' })
    expect(refreshCalls).toBe(0)
  })

  it('refreshes after all when the replay following another tab\'s refresh is still refused', async () => {
    installLocks()
    localStorage.setItem('ppms_last_refresh_at', String(Date.now()))

    const response = await apiClient.get('/pumps')

    expect(response.data).toEqual({ url: '/pumps' })
    expect(refreshCalls).toBe(1)
  })

  it('falls back to the in-tab single refresh when the browser has no lock manager', async () => {
    expect(navigator.locks).toBeUndefined()

    const responses = await Promise.all([apiClient.get('/pumps'), apiClient.get('/notifications')])

    expect(responses.map((response) => response.data.url)).toEqual(['/pumps', '/notifications'])
    expect(refreshCalls).toBe(1)
  })
})
