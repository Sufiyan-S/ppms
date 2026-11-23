import { afterEach, describe, expect, it } from 'vitest'
import { changeAppLanguage } from '../i18n'
import { serverText } from './serverText'

describe('serverText', () => {
  afterEach(async () => {
    await changeAppLanguage('en')
  })

  it('keeps the server\'s English for English users', () => {
    expect(serverText('ATTENTION_OVERDUE_SHIFTS', { count: 2 }, '2 shifts still open past the scheduled end'))
      .toBe('2 shifts still open past the scheduled end')
  })

  it('picks the plural form for the count', async () => {
    await changeAppLanguage('hi')
    expect(serverText('ATTENTION_OVERDUE_SHIFTS', { count: 1 }, 'english')).toBe('1 शिफ्ट तय समय के बाद भी चालू है')
    expect(serverText('ATTENTION_OVERDUE_SHIFTS', { count: 3 }, 'english')).toBe('3 शिफ्ट तय समय के बाद भी चालू हैं')
  })

  it('fills a text made of two counted parts', async () => {
    await changeAppLanguage('mr')
    expect(serverText('ATTENTION_PENDING_EXPENSES_AND_CREDIT_PAYMENTS', { expenseCount: 2, paymentCount: 1 }, 'english'))
      .toBe('2 खर्च आणि 1 क्रेडिट पेमेंट तुमच्या मंजुरीच्या प्रतीक्षेत')
  })

  it('joins a list of codes into words and translates enum codes', async () => {
    await changeAppLanguage('hi')
    expect(serverText('ATTENTION_SETUP_INCOMPLETE', { missingCodes: ['TANKS', 'FUEL_PRICES'] }, 'english'))
      .toBe('सेटअप में बाकी: टैंक, ईंधन कीमत')
    expect(serverText('STALE_FUEL_COST_CORRECTED',
      { fuelTypeCode: 'DIESEL', invoiceReference: 'INV-7', oldCost: '90.000', newCost: '91.000' }, 'english'))
      .toContain('डीज़ल डिलीवरी (इनवॉइस INV-7)')
  })

  it('falls back to the English text without a code or a translation', async () => {
    await changeAppLanguage('hi')
    expect(serverText(null, {}, 'Stored before codes existed')).toBe('Stored before codes existed')
    expect(serverText('NO_SUCH_TEXT', {}, 'Unknown code')).toBe('Unknown code')
  })
})
