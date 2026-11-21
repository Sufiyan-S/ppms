import { AxiosError } from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePumpStore } from '../store/usePumpStore'
import apiClient from './client'

function refuseWith(status: number, message: string) {
  return (config: InternalAxiosRequestConfig) =>
    Promise.reject(new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
      status, statusText: '', headers: {}, config, data: { message },
    }))
}

describe('apiClient suspended pump handling', () => {
  beforeEach(() => usePumpStore.setState({ selectedPumpId: 4, suspendedPumpId: null }))

  it('remembers the pump from the URL when the server says it is suspended', async () => {
    await expect(apiClient.get('/pumps/7/shifts/active', { adapter: refuseWith(403, 'Pump is suspended') })).rejects.toThrow()
    expect(usePumpStore.getState().suspendedPumpId).toBe(7)
  })

  it('falls back to the selected pump when the URL carries the pump as a parameter', async () => {
    await expect(apiClient.get('/users/staff?pumpId=4', { adapter: refuseWith(403, 'Pump is suspended') })).rejects.toThrow()
    expect(usePumpStore.getState().suspendedPumpId).toBe(4)
  })

  it('does not treat an ordinary forbidden answer as a suspension', async () => {
    await expect(apiClient.get('/pumps/7/payroll', { adapter: refuseWith(403, 'Access denied') })).rejects.toThrow()
    expect(usePumpStore.getState().suspendedPumpId).toBeNull()
  })
})
