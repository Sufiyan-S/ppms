import { describe, expect, it } from 'vitest'
import { NAMESPACES, SUPPORTED_LANGUAGES } from '../i18n/languages'

const localeFiles = import.meta.glob<Record<string, unknown>>('./*/*.json', { eager: true, import: 'default' })

function flatten(value: unknown, prefix = ''): Record<string, unknown> {
  if (value === null || typeof value !== 'object') return { [prefix]: value }
  return Object.entries(value).reduce<Record<string, unknown>>(
    (flat, [key, child]) => ({ ...flat, ...flatten(child, prefix ? `${prefix}.${key}` : key) }),
    {},
  )
}

function placeholders(text: unknown): string[] {
  return [...String(text).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]).sort()
}

function resource(language: string, namespace: string): Record<string, unknown> {
  const file = localeFiles[`./${language}/${namespace}.json`]
  if (!file) throw new Error(`Missing src/locales/${language}/${namespace}.json`)
  return flatten(file)
}

const translatedLanguages = SUPPORTED_LANGUAGES.filter((language) => language !== 'en')

describe('translation files', () => {
  it('exist for every language and namespace, and no others', () => {
    const expected = SUPPORTED_LANGUAGES.flatMap((language) => NAMESPACES.map((namespace) => `./${language}/${namespace}.json`))
    expect(Object.keys(localeFiles).sort()).toEqual(expected.sort())
  })

  describe.each(translatedLanguages)('%s', (language) => {
    it.each(NAMESPACES)('%s has exactly the English keys', (namespace) => {
      expect(Object.keys(resource(language, namespace)).sort()).toEqual(Object.keys(resource('en', namespace)).sort())
    })

    it.each(NAMESPACES)('%s has no empty values', (namespace) => {
      const empty = Object.entries(resource(language, namespace))
        .filter(([, text]) => typeof text !== 'string' || text.trim() === '')
        .map(([key]) => key)
      expect(empty).toEqual([])
    })

    it.each(NAMESPACES)('%s keeps the English placeholders', (namespace) => {
      const english = resource('en', namespace)
      const mismatched = Object.entries(resource(language, namespace))
        .filter(([key, text]) => placeholders(text).join() !== placeholders(english[key]).join())
        .map(([key]) => key)
      expect(mismatched).toEqual([])
    })
  })

  it('English has no empty values', () => {
    for (const namespace of NAMESPACES) {
      const empty = Object.entries(resource('en', namespace)).filter(([, text]) => String(text).trim() === '')
      expect(empty).toEqual([])
    }
  })
})
