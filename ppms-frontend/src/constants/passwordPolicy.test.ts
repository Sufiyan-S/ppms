import { describe, expect, it } from 'vitest'
import { PASSWORD_POLICY_REGEX } from './passwordPolicy'

describe('PASSWORD_POLICY_REGEX', () => {
  it('accepts 8 to 72 characters with every required kind of character', () => {
    expect(PASSWORD_POLICY_REGEX.test('Abcdef1!')).toBe(true)
    expect(PASSWORD_POLICY_REGEX.test('Abcdef1!' + 'a'.repeat(64))).toBe(true)
  })

  it('refuses more than 72 characters, as the server does', () => {
    expect(PASSWORD_POLICY_REGEX.test('Abcdef1!' + 'a'.repeat(65))).toBe(false)
  })
})
