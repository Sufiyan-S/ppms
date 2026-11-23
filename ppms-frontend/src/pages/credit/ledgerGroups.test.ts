import { describe, expect, it } from 'vitest'
import type { CreditTransaction } from '../../api/creditApi'
import { buildWeekGroups } from './ledgerGroups'

function tx(referenceId: number, businessDate: string, occurredAt = `${businessDate}T06:00:00Z`): CreditTransaction {
  return {
    type: 'SALE', referenceId, reference: null, referenceCode: null, referenceParams: {}, detail: null, amount: 10,
    runningBalance: 10, occurredAt, businessDate, status: 'ACTIVE', countedInBalance: true,
  }
}

describe('buildWeekGroups', () => {
  it('groups consecutive transactions of the same week in order', () => {
    const groups = buildWeekGroups([
      tx(1, '2026-03-20'),
      tx(2, '2026-03-17'),
      tx(3, '2026-03-12'),
    ])
    expect(groups.map(g => g.label)).toEqual(['16 Mar 2026 – 22 Mar 2026', '09 Mar 2026 – 15 Mar 2026'])
    expect(groups[0].items.map(t => t.referenceId)).toEqual([1, 2])
    expect(groups[1].items.map(t => t.referenceId)).toEqual([3])
  })

  it('puts a payment recorded late into the week it was paid, without a second group for that week', () => {
    const groups = buildWeekGroups([
      tx(1, '2026-03-20'),
      tx(2, '2026-03-12', '2026-03-19T06:00:00Z'),
      tx(3, '2026-03-17'),
      tx(4, '2026-03-11'),
    ])
    expect(groups.map(g => g.label)).toEqual(['16 Mar 2026 – 22 Mar 2026', '09 Mar 2026 – 15 Mar 2026'])
    expect(groups[0].items.map(t => t.referenceId)).toEqual([1, 3])
    expect(groups[1].items.map(t => t.referenceId)).toEqual([2, 4])
  })

  it('returns no groups for no transactions', () => {
    expect(buildWeekGroups([])).toEqual([])
  })
})
