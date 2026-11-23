import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TopBarClock } from './TopBarClock'

describe('TopBarClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-23T16:12:05Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('shows the pump time and date in IST with a spoken label', () => {
    const { container } = render(<TopBarClock />)

    expect(container.querySelector('time')).toHaveAttribute('dateTime', '2026-11-23T16:12:05.000Z')
    expect(container.querySelector('.ui-topbar-clock__time')).toHaveTextContent(/09:42:05\s?pm/i)
    expect(container.querySelector('.ui-topbar-clock__date')).toHaveTextContent('Mon, 23 Nov, 2026')
    expect(screen.getByText(/^Current time: /)).toHaveClass('sr-only')
  })

  it('ticks every second and re-renders only the digits that changed', () => {
    const { container } = render(<TopBarClock />)
    const firstHourDigit = container.querySelector('.ui-topbar-clock__digit')

    act(() => { vi.advanceTimersByTime(1000) })

    expect(container.querySelector('.ui-topbar-clock__time')).toHaveTextContent(/09:42:06/)
    expect(container.querySelector('.ui-topbar-clock__digit')).toBe(firstHourDigit)
  })
})
