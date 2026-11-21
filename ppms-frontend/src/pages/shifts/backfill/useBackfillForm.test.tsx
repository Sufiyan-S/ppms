import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fuelPriceApi } from '../../../api/fuelPriceApi'
import { pumpApi } from '../../../api/pumpApi'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import { userApi } from '../../../api/userApi'
import type { DUOption } from '../../../types/shift'
import { useBackfillForm } from './useBackfillForm'

vi.mock('../../../api/shiftApi', () => ({ shiftApi: { backfillShift: vi.fn() } }))
vi.mock('../../../api/shiftDefinitionApi', () => ({ shiftDefinitionApi: { getForDate: vi.fn() } }))
vi.mock('../../../api/userApi', () => ({ userApi: { getOperators: vi.fn() } }))
vi.mock('../../../api/fuelPriceApi', () => ({ fuelPriceApi: { getForDate: vi.fn() } }))
vi.mock('../../../api/pumpApi', () => ({ pumpApi: { getCreditClients: vi.fn(), getDUs: vi.fn() } }))

const du: DUOption = {
  id: 5, pumpId: 3, duNumber: 1, name: 'DU 1', status: 'ACTIVE',
  nozzles: [
    { id: 1, nozzleNumber: 1, fuelType: 'PETROL', lastReading: 0, maxMeterValue: 999_999, tankId: null, status: 'ACTIVE' },
    { id: 2, nozzleNumber: 2, fuelType: 'DIESEL', lastReading: 0, maxMeterValue: 999_999, tankId: null, status: 'ACTIVE' },
  ],
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

async function renderFilledForm() {
  const hook = renderHook(() => useBackfillForm({ pumpId: 3, onClose: vi.fn() }), { wrapper })
  await waitFor(() => expect(hook.result.current.dbPriceMap).toEqual({ PETROL: 100, DIESEL: null }))
  act(() => hook.result.current.selectDU(du))
  act(() => {
    hook.result.current.toggleNozzle(1)
    hook.result.current.toggleNozzle(2)
    hook.result.current.setOpeningReadings({ 1: '1000', 2: '500' })
    hook.result.current.setClosingReadings({ 1: '1010', 2: '505' })
    hook.result.current.setFuelRateInputs({ DIESEL: '90' })
  })
  return hook
}

describe('useBackfillForm totals', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.getDUs).mockResolvedValue([du])
    vi.mocked(shiftDefinitionApi.getForDate).mockResolvedValue([])
    vi.mocked(userApi.getOperators).mockResolvedValue([])
    vi.mocked(pumpApi.getCreditClients).mockResolvedValue([])
    vi.mocked(fuelPriceApi.getForDate).mockResolvedValue([
      { fuelType: 'PETROL', pricePerUnit: 100 },
      { fuelType: 'DIESEL', pricePerUnit: null },
    ])
  })

  it('expects the metered fuel value, using the typed rate where no price is recorded', async () => {
    const { result } = await renderFilledForm()
    expect(result.current.litersForNozzle(1)).toBe(10)
    expect(result.current.nozzleExpected).toEqual({ 1: 1000, 2: 450 })
    expect(result.current.totalExpected).toBe(1450)
    expect(result.current.allRatesResolved).toBe(true)
  })

  it('counts credit sales as collected, not as extra amount due', async () => {
    const { result } = await renderFilledForm()
    act(() => {
      result.current.setCashCollected('1000')
      result.current.setUpiCollected('200')
      result.current.addCreditRow()
    })
    act(() => result.current.updateCreditRow(result.current.creditRows[0]._key, { amount: '250' }))
    expect(result.current.totalExpected).toBe(1450)
    expect(result.current.creditNum).toBe(250)
    expect(result.current.totalCollected).toBe(1450)
    expect(result.current.discrepancyAmt).toBe(0)
  })

  it('reports a shortfall as a negative discrepancy', async () => {
    const { result } = await renderFilledForm()
    act(() => result.current.setCashCollected('1349.50'))
    expect(result.current.discrepancyAmt).toBe(-100.5)
  })

  it('has no expected total while a fuel rate is missing', async () => {
    const { result } = await renderFilledForm()
    act(() => result.current.setFuelRateInputs({}))
    expect(result.current.totalExpected).toBeNull()
    expect(result.current.discrepancyAmt).toBeNull()
    expect(result.current.allRatesResolved).toBe(false)
  })

  it('has no expected total while a closing reading is below the opening one', async () => {
    const { result } = await renderFilledForm()
    act(() => result.current.setClosingReadings({ 1: '999', 2: '505' }))
    expect(result.current.litersForNozzle(1)).toBeNull()
    expect(result.current.totalExpected).toBeNull()
  })
})
