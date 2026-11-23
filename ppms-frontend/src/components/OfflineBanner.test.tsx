import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfflineBanner } from './OfflineBanner'

function goOffline(offline: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(!offline)
  act(() => { window.dispatchEvent(new Event(offline ? 'offline' : 'online')) })
}

describe('OfflineBanner', () => {
  afterEach(() => vi.restoreAllMocks())

  it('announces when the connection drops and clears when it comes back', () => {
    render(<OfflineBanner />)
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()

    goOffline(true)
    expect(status).toHaveTextContent("You're offline")

    goOffline(false)
    expect(status).toBeEmptyDOMElement()
  })
})
