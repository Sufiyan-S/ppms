import { afterEach, describe, expect, it, vi } from 'vitest'
import { pageLoaders, prefetchLandingPage } from './pageLoaders'

describe('prefetchLandingPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('starts loading the dashboard layout and the landing page together', () => {
    const dashboard = vi.spyOn(pageLoaders, 'dashboard').mockResolvedValue({} as never)
    const credit = vi.spyOn(pageLoaders, 'credit').mockResolvedValue({} as never)
    prefetchLandingPage('/dashboard/credit')
    expect(dashboard).toHaveBeenCalledTimes(1)
    expect(credit).toHaveBeenCalledTimes(1)
  })

  it('loads only the super admin page for the super admin landing path', () => {
    const dashboard = vi.spyOn(pageLoaders, 'dashboard').mockResolvedValue({} as never)
    const superAdmin = vi.spyOn(pageLoaders, 'superAdmin').mockResolvedValue({} as never)
    prefetchLandingPage('/super-admin')
    expect(superAdmin).toHaveBeenCalledTimes(1)
    expect(dashboard).not.toHaveBeenCalled()
  })

  it('does nothing for an unknown path', () => {
    const dashboard = vi.spyOn(pageLoaders, 'dashboard')
    prefetchLandingPage('/nowhere')
    expect(dashboard).not.toHaveBeenCalled()
  })
})
