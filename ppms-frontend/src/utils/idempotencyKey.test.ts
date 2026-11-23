import { describe, expect, it } from 'vitest'
import { attemptFor, newIdempotencyKey } from './idempotencyKey'

describe('idempotency keys', () => {
  it('makes a fresh 32-character hex key each time', () => {
    const first = newIdempotencyKey()
    expect(first).toMatch(/^[0-9a-f]{32}$/)
    expect(newIdempotencyKey()).not.toBe(first)
  })

  it('keeps the key for a resend of the same request and changes it when the request changes', () => {
    const first = attemptFor(null, { cash: 1000 })

    expect(attemptFor(first, { cash: 1000 })).toBe(first)
    expect(attemptFor(first, { cash: 900 }).key).not.toBe(first.key)
  })
})
