import { beforeEach, describe, expect, it, vi } from 'vitest'
import client from './client'
import { userApi } from './userApi'

vi.mock('./client', () => ({ default: { patch: vi.fn() } }))

const patch = vi.mocked(client.patch)

// The server reads these fields from the JSON body (UpdateUserStatusRequest, MoveToPumpRequest).
describe('userApi', () => {
  beforeEach(() => patch.mockReset().mockResolvedValue({ data: {} }))

  it('sends the new status in the request body', async () => {
    await userApi.updateUserStatus(12, 'INACTIVE')
    expect(patch).toHaveBeenCalledWith('/users/12/status', { status: 'INACTIVE' })
  })

  it('sends the target pump in the request body when moving staff', async () => {
    await userApi.moveToPump(12, 7)
    expect(patch).toHaveBeenCalledWith('/users/12/assigned-pump', { pumpId: 7 })
  })
})
