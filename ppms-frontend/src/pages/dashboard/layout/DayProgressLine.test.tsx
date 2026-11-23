import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DayProgressLine } from './DayProgressLine'

describe('DayProgressLine', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function fill(container: HTMLElement) {
    return container.querySelector<HTMLElement>('.ui-topbar-day-progress__fill')
  }

  it('fills to the share of the IST day already gone and is hidden from screen readers', () => {
    vi.setSystemTime(new Date('2026-11-23T12:30:00Z')) // 18:00 IST
    const { container } = render(<DayProgressLine />)

    expect(fill(container)).toHaveStyle({ width: '75%' })
    expect(container.querySelector('.ui-topbar-day-progress')).toHaveAttribute('aria-hidden', 'true')
  })

  it('starts empty at IST midnight and grows every minute', () => {
    vi.setSystemTime(new Date('2026-11-22T18:30:00Z')) // 00:00 IST
    const { container } = render(<DayProgressLine />)
    expect(fill(container)).toHaveStyle({ width: '0%' })

    act(() => { vi.advanceTimersByTime(144 * 60_000) }) // 02:24 IST, a tenth of the day

    expect(fill(container)).toHaveStyle({ width: '10%' })
  })
})
