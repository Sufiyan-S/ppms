import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CreditClient } from '../../../api/pumpApi'
import type { CreditEntry } from '../../../types/shift'
import { useCloseShiftCreditRows } from './useCloseShiftCreditRows'

const parent = { id: 1, name: 'Acme', parentClientId: null, isParent: true } as CreditClient
const truck = { id: 2, name: 'Acme Truck 7', parentClientId: 1, isParent: false } as CreditClient
const entry: CreditEntry = {
  id: 90, clientId: 2, clientName: 'Acme Truck 7', billNo: 'B-1', amount: 750, fuelType: 'DIESEL',
  description: 'Night fill', voidStatus: 'ACTIVE', voidReason: null,
}

describe('useCloseShiftCreditRows', () => {
  it('copies a recorded sub-account entry into an editable row that keeps the client, sub-account and the entry it replaces', () => {
    const { result } = renderHook(() => useCloseShiftCreditRows(['PETROL', 'DIESEL'], [parent, truck]))
    act(() => result.current.editRecordedEntry(entry))
    const [row] = result.current.creditRows
    expect(row).toMatchObject({
      clientId: 1, clientName: 'Acme', subAccountId: 2, subAccountName: 'Acme Truck 7',
      fuelType: 'DIESEL', billNo: 'B-1', amount: '750', replacesEntryId: 90,
    })
    expect(result.current.expandedRowId).toBe(row.id)
  })

  it('adds an empty row for the first fuel type and removes it again', () => {
    const { result } = renderHook(() => useCloseShiftCreditRows(['PETROL'], []))
    act(() => result.current.addCreditRow())
    const id = result.current.creditRows[0].id
    expect(result.current.creditRows[0]).toMatchObject({ fuelType: 'PETROL', amount: '', replacesEntryId: null })
    act(() => result.current.removeCreditRow(id))
    expect(result.current.creditRows).toHaveLength(0)
    expect(result.current.expandedRowId).toBeNull()
  })
})
