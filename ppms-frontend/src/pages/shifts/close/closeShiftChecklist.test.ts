import { describe, expect, it } from 'vitest'
import type { CreditRow } from '../components/creditRow'
import { isCreditRowComplete, stillNeededItems } from './closeShiftChecklist'

const completeRow: CreditRow = {
  id: 1, clientId: 3, clientName: 'Acme', clientSearch: 'Acme', showDropdown: false,
  subAccountId: null, subAccountName: '', fuelType: 'PETROL', billNo: '', amount: '200', liters: '',
  inputMode: 'amount', description: '', replacesEntryId: null,
}

const ready = {
  isHandover: false, incomingChosen: true, missingReadingCount: 0, readingsBelowStart: false,
  paymentTouched: true, creditRows: [completeRow], hasDiscrepancy: false, reasonFilled: false,
}

describe('stillNeededItems', () => {
  it('is empty once everything needed to review is in', () => {
    expect(stillNeededItems(ready)).toEqual([])
  })

  it('lists what is missing in the order the form asks for it', () => {
    expect(stillNeededItems({
      ...ready, isHandover: true, incomingChosen: false, missingReadingCount: 2, readingsBelowStart: true,
      paymentTouched: false, creditRows: [{ ...completeRow, amount: '' }], hasDiscrepancy: true,
    })).toEqual([
      { kind: 'incomingOperator' },
      { kind: 'endReadings', count: 2 },
      { kind: 'readingsBelowStart' },
      { kind: 'creditEntries', count: 1 },
      { kind: 'payments' },
      { kind: 'reason' },
    ])
  })

  it('asks for a reason only when there is a difference without one', () => {
    expect(stillNeededItems({ ...ready, hasDiscrepancy: true, reasonFilled: true })).toEqual([])
    expect(stillNeededItems({ ...ready, hasDiscrepancy: true })).toEqual([{ kind: 'reason' }])
  })

  it('never asks for an incoming operator on a normal close', () => {
    expect(stillNeededItems({ ...ready, incomingChosen: false })).toEqual([])
  })
})

describe('isCreditRowComplete', () => {
  it('needs a client chosen from the list, a fuel and an amount above zero', () => {
    expect(isCreditRowComplete(completeRow)).toBe(true)
    expect(isCreditRowComplete({ ...completeRow, clientId: null })).toBe(false)
    expect(isCreditRowComplete({ ...completeRow, clientName: ' ' })).toBe(false)
    expect(isCreditRowComplete({ ...completeRow, fuelType: '' })).toBe(false)
    expect(isCreditRowComplete({ ...completeRow, amount: '0' })).toBe(false)
  })
})
