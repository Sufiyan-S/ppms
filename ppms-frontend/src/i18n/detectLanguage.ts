import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, isAppLanguage } from './languages'
import type { AppLanguage } from './languages'

/** The signed-in user's choice wins, then the sign-in page's choice on this device, then the browser's languages, then English. */
export function detectLanguage(
  userLanguage: string | null | undefined,
  storedLanguage: string | null,
  browserLanguages: readonly string[],
): AppLanguage {
  if (isAppLanguage(userLanguage)) return userLanguage
  if (isAppLanguage(storedLanguage)) return storedLanguage
  for (const browserLanguage of browserLanguages) {
    const base = browserLanguage.toLowerCase().split('-')[0]
    if (isAppLanguage(base)) return base
  }
  return DEFAULT_LANGUAGE
}

export function readStoredLanguage(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY)
  } catch {
    // Storage blocked (private mode): the browser's languages decide instead.
    return null
  }
}

export function storeLanguage(language: AppLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch (error) {
    console.warn('Could not remember the chosen language on this device', error)
  }
}

export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  return navigator.languages?.length ? navigator.languages : [navigator.language]
}
