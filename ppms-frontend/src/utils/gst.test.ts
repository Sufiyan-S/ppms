import { describe, expect, it } from 'vitest'
import { isValidGstin, isValidHsnCode, isValidInvoicePrefix, normaliseGstText } from './gst'

describe('gst field checks', () => {
  it('accepts a lower-case GSTIN once upper-cased and an empty one', () => {
    expect(isValidGstin(' 27abcde1234f1z5 ')).toBe(true)
    expect(isValidGstin('')).toBe(true)
    expect(normaliseGstText(' 27abcde1234f1z5 ')).toBe('27ABCDE1234F1Z5')
  })

  it('refuses a GSTIN of the wrong shape', () => {
    expect(isValidGstin('27ABCDE1234F1Z')).toBe(false)
    expect(isValidGstin('27ABCDE1234F0Z5')).toBe(false)
  })

  it('needs 4 to 8 digits for an HSN code', () => {
    expect(isValidHsnCode('2710')).toBe(true)
    expect(isValidHsnCode('27101980')).toBe(true)
    expect(isValidHsnCode('271')).toBe(false)
    expect(isValidHsnCode('27A0')).toBe(false)
  })

  it('allows 1 to 5 letters or digits for an invoice prefix', () => {
    expect(isValidInvoicePrefix('pmp3')).toBe(true)
    expect(isValidInvoicePrefix('PUMP12')).toBe(false)
    expect(isValidInvoicePrefix('P/3')).toBe(false)
  })
})
