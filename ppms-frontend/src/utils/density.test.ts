import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyDensity, readStoredDensity, storeDensity } from './density'

describe('density', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete document.documentElement.dataset.density
  })

  it('starts comfortable and remembers compact on this device', () => {
    expect(readStoredDensity()).toBe('comfortable')
    storeDensity('compact')
    expect(readStoredDensity()).toBe('compact')
  })

  it('marks the page so the stylesheet can tighten rows and cards', () => {
    applyDensity('compact')
    expect(document.documentElement).toHaveAttribute('data-density', 'compact')
  })

  it('falls back to comfortable when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(readStoredDensity()).toBe('comfortable')
    expect(() => storeDensity('compact')).not.toThrow()
    expect(warn).toHaveBeenCalledOnce()
  })
})
