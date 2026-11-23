import { activeLanguage, translateKey } from './index'
import type { AppLanguage } from './languages'

export const IST_TIME_ZONE = 'Asia/Kolkata'

// Meters, receipts and bills use 0–9, so Hindi and Marathi keep Latin digits instead of Devanagari ones.
const INTL_LOCALES: Record<AppLanguage, string> = {
  en: 'en-IN',
  hi: 'hi-IN-u-nu-latn',
  mr: 'mr-IN-u-nu-latn',
}

export function intlLocale(language: AppLanguage = activeLanguage()): string {
  return INTL_LOCALES[language]
}

const numberFormats = new Map<string, Intl.NumberFormat>()
const dateTimeFormats = new Map<string, Intl.DateTimeFormat>()

function numberFormat(options: Intl.NumberFormatOptions, language: AppLanguage): Intl.NumberFormat {
  const locale = intlLocale(language)
  const key = `${locale}|${JSON.stringify(options)}`
  let format = numberFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(locale, options)
    numberFormats.set(key, format)
  }
  return format
}

function dateTimeFormat(options: Intl.DateTimeFormatOptions, language: AppLanguage): Intl.DateTimeFormat {
  const locale = intlLocale(language)
  const key = `${locale}|${JSON.stringify(options)}`
  let format = dateTimeFormats.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { timeZone: IST_TIME_ZONE, ...options })
    dateTimeFormats.set(key, format)
  }
  return format
}

/** Indian grouping (1,00,000) in the active language, always with digits 0–9. */
export function formatNumberIn(n: number, options: Intl.NumberFormatOptions = {}, language: AppLanguage = activeLanguage()): string {
  return numberFormat(options, language).format(n)
}

/** ₹1,00,000.00 */
export function formatRupees(n: number, language: AppLanguage = activeLanguage()): string {
  return `₹${formatNumberIn(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, language)}`
}

/** 1,234.567 L — the unit stays "L" in every language. */
export function formatLitresIn(n: number, decimals = 3, language: AppLanguage = activeLanguage()): string {
  return `${formatNumberIn(n, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }, language)} L`
}

/** A date or time in India Standard Time, whatever the device's time zone is. */
export function formatDateTimeIn(date: Date, options: Intl.DateTimeFormatOptions, language: AppLanguage = activeLanguage()): string {
  return dateTimeFormat(options, language).format(date)
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "just now", "5m ago", "2h ago", "3d ago" in the active language; null after a week, when a date reads better. */
export function formatTimeAgo(elapsedMs: number): string | null {
  if (elapsedMs < MINUTE) return translateKey('common:time.justNow')
  if (elapsedMs < HOUR) return translateKey('common:time.minutesAgo', { value: Math.floor(elapsedMs / MINUTE) })
  if (elapsedMs < DAY) return translateKey('common:time.hoursAgo', { value: Math.floor(elapsedMs / HOUR) })
  if (elapsedMs < 7 * DAY) return translateKey('common:time.daysAgo', { value: Math.floor(elapsedMs / DAY) })
  return null
}
