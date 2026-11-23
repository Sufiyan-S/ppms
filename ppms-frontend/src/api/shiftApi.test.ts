import { beforeEach, describe, expect, it, vi } from 'vitest'
import client from './client'
import { shiftApi } from './shiftApi'
import type { Shift } from '../types/shift'

vi.mock('./client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const get = vi.mocked(client.get)

// The shape Spring sends for Page<ShiftResponse> with PageSerializationMode.VIA_DTO
function springPage(content: Partial<Shift>[], number: number, totalPages: number) {
  return { data: { content, page: { size: 200, number, totalElements: content.length, totalPages } } }
}

describe('shiftApi.getShiftHistory', () => {
  beforeEach(() => get.mockReset())

  it('stops after the last page reported by the server', async () => {
    get.mockResolvedValueOnce(springPage([{ id: 1 }], 0, 2))
    get.mockResolvedValueOnce(springPage([{ id: 2 }], 1, 2))

    const shifts = await shiftApi.getShiftHistory(7, { from: '2026-11-01' })

    expect(shifts.map((s) => s.id)).toEqual([1, 2])
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('makes one request when there is a single page', async () => {
    get.mockResolvedValueOnce(springPage([{ id: 1 }], 0, 1))

    await shiftApi.getShiftHistory(7, { from: '2026-11-01' })

    expect(get).toHaveBeenCalledTimes(1)
  })

  it('stops on an empty page even if the server keeps reporting more pages', async () => {
    get.mockResolvedValue(springPage([], 0, 99))

    await shiftApi.getShiftHistory(7, { discrepanciesOnly: true })

    expect(get).toHaveBeenCalledTimes(1)
  })

  it('never requests more than the page cap', async () => {
    get.mockImplementation((_url, config) => {
      const page = (config?.params as { page: number } | undefined)?.page ?? 0
      return Promise.resolve(springPage([{ id: page }], page, 1000))
    })

    const shifts = await shiftApi.getShiftHistory(7, { from: '2020-01-01' })

    expect(get).toHaveBeenCalledTimes(25)
    expect(shifts).toHaveLength(25)
  })

  it('sends the filter and page to the history endpoint', async () => {
    get.mockResolvedValueOnce(springPage([], 0, 0))

    await shiftApi.getShiftHistoryPage(7, { from: '2026-11-01', to: '2026-11-20', discrepanciesOnly: true, discrepancyType: 'SHORT' }, 3, 10)

    expect(get).toHaveBeenCalledWith('/pumps/7/shifts/history', {
      params: { page: 3, size: 10, from: '2026-11-01', to: '2026-11-20', discrepanciesOnly: true, discrepancyType: 'SHORT' },
    })
  })
})

describe('shiftApi writes that may be resent', () => {
  const post = vi.mocked(client.post)
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: {} })
  })

  it('sends the Idempotency-Key header on close, handover and credit entry', async () => {
    const closing = { fuelReadings: [], cashCollected: 0, upiCollected: 0, cardCollected: 0, fleetCardCollected: 0, creditTotal: 0, creditEntries: [], replacedCreditEntryIds: [] }
    await shiftApi.closeShift(7, 11, closing, 'key-close')
    await shiftApi.createHandover(7, { outgoingShiftId: 11, incomingOperatorId: 4, physicalCashVerified: true, meterReadingsVerified: true, closing }, 'key-handover')
    await shiftApi.addCreditEntry(7, 11, { clientName: 'Fleet Co', amount: 10 }, 'key-credit')

    expect(post.mock.calls.map((call) => call[2])).toEqual([
      { headers: { 'Idempotency-Key': 'key-close' } },
      { headers: { 'Idempotency-Key': 'key-handover' } },
      { headers: { 'Idempotency-Key': 'key-credit' } },
    ])
  })

  it('sends no header when no key is given', async () => {
    await shiftApi.addCreditEntry(7, 11, { clientName: 'Fleet Co', amount: 10 })
    expect(post.mock.calls[0][2]).toBeUndefined()
  })
})
