import { describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { parseApiError, serverMessage } from './apiError'

function axiosError(status: number | undefined, data?: unknown) {
  const response = status === undefined ? undefined : {
    status, statusText: '', data, headers: {}, config: { headers: new AxiosHeaders() },
  }
  return new AxiosError('Request failed', 'ERR', undefined, undefined, response)
}

describe('parseApiError', () => {
  it('shows the backend message for a 400 validation error', () => {
    expect(parseApiError(axiosError(400, { message: 'Amount must be positive' }))).toBe('Amount must be positive')
  })

  it('shows the backend message for a 409 conflict', () => {
    expect(parseApiError(axiosError(409, { message: 'Shift already closed' }))).toBe('Shift already closed')
  })

  it('shows the backend message for a 429 rate limit', () => {
    expect(parseApiError(axiosError(429, { message: 'Too many attempts. Try again later.' })))
      .toBe('Too many attempts. Try again later.')
  })

  it('hides a 500 message behind the fallback', () => {
    expect(parseApiError(axiosError(500, { message: 'NullPointerException at Foo.java:12' }))).toBe('Something went wrong. Please try again.')
  })

  it('uses a custom fallback when given', () => {
    expect(parseApiError(axiosError(503, { message: 'down' }), 'Failed to save')).toBe('Failed to save')
  })

  it('uses the fallback for a 4xx without a usable message', () => {
    expect(parseApiError(axiosError(404, {}), 'Not found')).toBe('Not found')
    expect(parseApiError(axiosError(400, { message: '   ' }), 'Bad')).toBe('Bad')
    expect(parseApiError(axiosError(400, { message: 42 }), 'Bad')).toBe('Bad')
  })

  it('uses the fallback for a network error with no response', () => {
    expect(parseApiError(axiosError(undefined), 'Offline')).toBe('Offline')
  })

  it('uses the fallback for a non-Axios error', () => {
    expect(parseApiError(new Error('boom'))).toBe('Something went wrong. Please try again.')
    expect(parseApiError('boom', 'x')).toBe('x')
  })
})

describe('serverMessage', () => {
  it('returns the trimmed backend message whatever the status', () => {
    expect(serverMessage(axiosError(500, { message: '  Busy  ' }))).toBe('Busy')
  })

  it('returns undefined for blank, missing or non-string messages', () => {
    expect(serverMessage(axiosError(400, { message: '' }))).toBeUndefined()
    expect(serverMessage(axiosError(400))).toBeUndefined()
    expect(serverMessage(axiosError(400, { message: ['a'] }))).toBeUndefined()
  })

  it('returns undefined for a non-Axios error', () => {
    expect(serverMessage(new Error('x'))).toBeUndefined()
  })
})
