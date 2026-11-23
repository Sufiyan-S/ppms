import { describe, expect, it } from 'vitest'
import { whatsAppNumber, whatsAppShareUrl } from './whatsApp'

describe('whatsAppNumber', () => {
  it.each([
    ['9876543210', '919876543210'],
    ['98765 43210', '919876543210'],
    ['09876543210', '919876543210'],
    ['+91 98765-43210', '919876543210'],
    ['919876543210', '919876543210'],
  ])('turns %s into %s', (phone, expected) => {
    expect(whatsAppNumber(phone)).toBe(expected)
  })

  it.each([null, '', '12345', '44 20 7946 0958 12'])('refuses %s', (phone) => {
    expect(whatsAppNumber(phone)).toBeNull()
  })
})

describe('whatsAppShareUrl', () => {
  it('puts the encoded message after the number', () => {
    expect(whatsAppShareUrl('9876543210', 'Balance ₹1,200.00 & due'))
      .toBe('https://wa.me/919876543210?text=Balance%20%E2%82%B91%2C200.00%20%26%20due')
  })

  it('gives no link without a usable phone', () => {
    expect(whatsAppShareUrl(null, 'hello')).toBeNull()
  })
})
