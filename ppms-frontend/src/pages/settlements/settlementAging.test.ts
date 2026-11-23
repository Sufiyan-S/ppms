import { describe, expect, it } from 'vitest'
import type { PendingSettlementRange } from '../../api/paymentSettlementApi'
import { ageLabel, collectionDaysLabel, daysCoveredBy } from './settlementAging'

const upi: PendingSettlementRange = {
  paymentType: 'UPI', fromDate: '2026-11-18', toDate: '2026-11-20', amount: 25248, ageDays: 5, overdue: true,
  days: [
    { date: '2026-11-18', amount: 10000 },
    { date: '2026-11-19', amount: 8000 },
    { date: '2026-11-20', amount: 7248 },
  ],
}
const card: PendingSettlementRange = {
  paymentType: 'CARD', fromDate: '2026-11-17', toDate: '2026-11-17', amount: 500, ageDays: 6, overdue: true,
  days: [{ date: '2026-11-17', amount: 500 }],
}

describe('collectionDaysLabel', () => {
  it('shortens a range inside one month and spells out one across months', () => {
    expect(collectionDaysLabel('2026-11-18', '2026-11-20')).toBe('18–20 Nov')
    expect(collectionDaysLabel('2026-11-30', '2026-12-02')).toBe('30 Nov – 2 Dec')
    expect(collectionDaysLabel('2026-11-18', '2026-11-18')).toBe('18 Nov')
  })
})

describe('ageLabel', () => {
  it('counts days since collection', () => {
    expect(ageLabel(0)).toBe('today')
    expect(ageLabel(1)).toBe('1 day')
    expect(ageLabel(3)).toBe('3 days')
  })
})

describe('daysCoveredBy', () => {
  it('clears the oldest days of that payment type first and shows a part-covered last day', () => {
    expect(daysCoveredBy([card, upi], 'UPI', 20000)).toEqual([
      { date: '2026-11-18', covered: 10000, unsettled: 10000 },
      { date: '2026-11-19', covered: 8000, unsettled: 8000 },
      { date: '2026-11-20', covered: 2000, unsettled: 7248 },
    ])
  })

  it('covers nothing for no amount or a type with nothing pending', () => {
    expect(daysCoveredBy([upi], 'UPI', 0)).toEqual([])
    expect(daysCoveredBy([upi], 'FLEET_CARD', 100)).toEqual([])
  })

  it('stops at what is pending when the amount is larger', () => {
    expect(daysCoveredBy([card], 'CARD', 900)).toEqual([{ date: '2026-11-17', covered: 500, unsettled: 500 }])
  })
})
