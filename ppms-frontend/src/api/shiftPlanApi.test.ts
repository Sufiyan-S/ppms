import { beforeEach, describe, expect, it, vi } from 'vitest'
import client from './client'
import { shiftPlanApi } from './shiftPlanApi'

vi.mock('./client', () => ({ default: { get: vi.fn() } }))

const get = vi.mocked(client.get)

describe('shiftPlanApi.getPlan', () => {
  beforeEach(() => get.mockReset())

  it('returns null when no plan exists for the week', async () => {
    get.mockResolvedValueOnce({ status: 404, data: { message: 'No plan' } })

    await expect(shiftPlanApi.getPlan(2, '2026-11-16')).resolves.toBeNull()
  })

  it('treats 404 as an answer, not an error', async () => {
    get.mockResolvedValueOnce({ status: 200, data: { id: 9 } })

    await expect(shiftPlanApi.getPlan(2, '2026-11-16')).resolves.toEqual({ id: 9 })
    const validateStatus = get.mock.calls[0][1]?.validateStatus
    expect(validateStatus?.(404)).toBe(true)
    expect(validateStatus?.(500)).toBe(false)
  })
})
