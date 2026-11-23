import i18n from 'i18next'
import type { TOptions } from 'i18next'
import { initReactI18next } from 'react-i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import { enResources } from '../locales/en'
import { loadDevanagariFont } from './fonts'
import { DEFAULT_LANGUAGE, NAMESPACES, SUPPORTED_LANGUAGES, isAppLanguage, usesDevanagari } from './languages'
import type { AppLanguage } from './languages'

// English is bundled; every other language is one lazily loaded chunk per namespace.
const lazyLocaleFiles = import.meta.glob<{ default: Record<string, unknown> }>(['../locales/*/*.json', '!../locales/en/*.json'])

function loadLocaleFile(language: string, namespace: string) {
  const load = lazyLocaleFiles[`../locales/${language}/${namespace}.json`]
  if (!load) return Promise.reject(new Error(`No ${namespace} translations for ${language}`))
  return load().then((module) => module.default)
}

function applyLanguageToPage(language: string) {
  if (!isAppLanguage(language)) return
  document.documentElement.lang = language
  if (usesDevanagari(language)) void loadDevanagariFont()
}

/** Loads the language's translations before the first render, so the first screen is not English-then-Hindi. */
export async function initI18n(language: AppLanguage): Promise<void> {
  if (!i18n.isInitialized) {
    i18n.on('languageChanged', applyLanguageToPage)
    await i18n
      .use(resourcesToBackend(loadLocaleFile))
      .use(initReactI18next)
      .init({
        lng: language,
        fallbackLng: DEFAULT_LANGUAGE,
        supportedLngs: SUPPORTED_LANGUAGES,
        ns: NAMESPACES,
        defaultNS: 'common',
        resources: { en: enResources },
        partialBundledLanguages: true,
        interpolation: { escapeValue: false },
        react: { useSuspense: false },
        showSupportNotice: false,
      })
  } else {
    await i18n.changeLanguage(language)
  }
  applyLanguageToPage(language)
}

/** Switches every screen to the language; resolves once its translations have loaded. */
export async function changeAppLanguage(language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language)
}

export function activeLanguage(): AppLanguage {
  const language = i18n.resolvedLanguage ?? i18n.language
  return isAppLanguage(language) ? language : DEFAULT_LANGUAGE
}

/** For keys built at run time, such as `enums:${code}` or `errors:${code}`, which the typed t() cannot check. */
export function translateKey(key: string, options?: TOptions): string {
  return (i18n.t as (key: string, options?: TOptions) => string)(key, options)
}

export function hasTranslation(key: string, options?: TOptions): boolean {
  return i18n.exists(key, options)
}

export default i18n
