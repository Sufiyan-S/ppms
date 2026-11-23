export const SUPPORTED_LANGUAGES = ['en', 'hi', 'mr'] as const

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: AppLanguage = 'en'

/** Machine-drafted translations still waiting for a native speaker's review. */
export const DRAFT_LOCALES: readonly AppLanguage[] = ['hi', 'mr']

/** Each language named in its own script, so a reader finds theirs without knowing the others. */
export const LANGUAGE_NATIVE_NAMES: Record<AppLanguage, string> = {
  en: 'English',
  hi: 'हिन्दी',
  mr: 'मराठी',
}

/** Every namespace a language loads; add a namespace here and as src/locales/<lang>/<namespace>.json for all languages. */
export const NAMESPACES = [
  'common', 'auth', 'nav', 'errors', 'enums',
  'shifts',
  'inventory',
  'cash',
  'expenses',
  'ancillary',
  'calibration',
  'documents',
  'credit',
  'settlements',
  'payroll',
  'setup',
  'dashboard',
  'approvals',
  'notifications',
  'reports',
  'balancesheet',
  'audit',
  'superadmin',
  'portal',
] as const

/** The language picked on the sign-in page, before anyone is signed in. */
export const LANGUAGE_STORAGE_KEY = 'ppms_language'

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

export function usesDevanagari(language: AppLanguage): boolean {
  return language === 'hi' || language === 'mr'
}
