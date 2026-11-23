import { describe, expect, it } from 'vitest'
import { detectLanguage, readStoredLanguage, storeLanguage } from './detectLanguage'

describe('detectLanguage', () => {
  it('prefers the signed-in user\'s language over everything else', () => {
    expect(detectLanguage('mr', 'hi', ['hi-IN'])).toBe('mr')
  })

  it('uses the sign-in page choice on this device when nobody is signed in', () => {
    expect(detectLanguage(undefined, 'hi', ['mr-IN'])).toBe('hi')
  })

  it('falls back to the first supported browser language', () => {
    expect(detectLanguage(null, null, ['ta-IN', 'mr-IN', 'hi'])).toBe('mr')
    expect(detectLanguage(null, null, ['HI'])).toBe('hi')
  })

  it('uses English when nothing else is supported', () => {
    expect(detectLanguage(null, null, ['fr-FR', 'ta'])).toBe('en')
    expect(detectLanguage(null, null, [])).toBe('en')
  })

  it('ignores unsupported saved values instead of trusting them', () => {
    expect(detectLanguage('fr', 'gu', ['hi-IN'])).toBe('hi')
  })

  it('remembers the sign-in page choice on this device', () => {
    storeLanguage('mr')
    expect(readStoredLanguage()).toBe('mr')
  })
})
