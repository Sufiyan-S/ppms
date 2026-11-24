import { afterEach, describe, expect, it } from 'vitest'
import { changeAppLanguage } from './index'
import { formatDateTimeIn, formatLitresIn, formatNumberIn, formatRupees, formatTimeAgo } from './format'
import { formatCurrency, formatLitres } from '../utils/format'
import { formatIstDate, formatIstDateTime } from '../utils/date'
import { relativeTime } from '../utils/relativeTime'

const DEVANAGARI_DIGIT = /[०-९]/

afterEach(async () => {
  await changeAppLanguage('en')
})

describe('locale formatters', () => {
  it.each(['en', 'hi', 'mr'] as const)('show rupees with Indian grouping and Latin digits in %s', (language) => {
    expect(formatRupees(100000, language)).toBe('₹1,00,000.00')
    expect(formatRupees(1234567.5, language)).toBe('₹12,34,567.50')
    expect(formatLitresIn(1234.5, 2, language)).toBe('1,234.50 L')
    expect(formatNumberIn(9876543, {}, language)).toBe('98,76,543')
  })

  it('never use Devanagari digits in dates and times', () => {
    const instant = new Date('2026-11-23T18:45:00Z')
    for (const language of ['hi', 'mr'] as const) {
      const text = formatDateTimeIn(instant, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }, language)
      expect(text).not.toMatch(DEVANAGARI_DIGIT)
      expect(text).toContain('2026')
    }
  })

  it('show dates and times in India Standard Time', () => {
    const lateEveningUtc = new Date('2026-11-23T19:00:00Z')
    expect(formatDateTimeIn(lateEveningUtc, { day: 'numeric' }, 'en')).toBe('24')
    expect(formatDateTimeIn(lateEveningUtc, { hour: '2-digit', minute: '2-digit', hour12: false }, 'mr')).toBe('00:30')
  })

  it('make the shared helpers follow the active language', async () => {
    await changeAppLanguage('mr')

    expect(formatCurrency(100000)).toBe('₹1,00,000.00')
    expect(formatLitres(12.5)).toBe('12.50 L')
    expect(formatIstDate('2026-11-23')).toMatch(/^23 .+ 2026$/)
    expect(formatIstDate('2026-11-23')).not.toBe('23 Nov 2026')
    expect(formatIstDateTime(new Date('2026-11-23T06:30:00Z'))).not.toMatch(DEVANAGARI_DIGIT)
  })

  it('say how long ago in the active language', async () => {
    const now = new Date('2026-11-23T12:00:00Z')
    expect(relativeTime('2026-11-23T11:55:00Z', now)).toBe('5m ago')

    await changeAppLanguage('hi')
    expect(relativeTime('2026-11-23T11:55:00Z', now)).toBe('5 मिनट पहले')
    expect(formatTimeAgo(30_000)).toBe('अभी-अभी')

    await changeAppLanguage('mr')
    expect(relativeTime('2026-11-23T10:00:00Z', now)).toBe('2 तासांपूर्वी')
  })
})
