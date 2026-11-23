import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import { NO_CONNECTION_MESSAGE, NO_SERVER_RESPONSE_MESSAGE } from '../../utils/apiError'
import {
  SERVER_PROBLEM_MESSAGE, SIGN_IN_REFUSED_MESSAGE, TOO_MANY_ATTEMPTS_MESSAGE, WRONG_CREDENTIALS_MESSAGE, loginErrorMessage,
} from './loginErrorMessage'

function refusedWith(status: number, data: unknown = {}) {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status, statusText: '', data, headers: {}, config: { headers: new AxiosHeaders() },
  })
}

describe('loginErrorMessage', () => {
  it('names wrong credentials for a 401', () => {
    expect(loginErrorMessage(refusedWith(401, { message: 'Invalid phone number or password' }))).toBe(WRONG_CREDENTIALS_MESSAGE)
  })

  it('passes on the wait time the server gives for too many attempts', () => {
    expect(loginErrorMessage(refusedWith(429, { message: 'Too many failed login attempts. Please wait 15 minutes before trying again.' })))
      .toBe('Too many failed login attempts. Please wait 15 minutes before trying again.')
    expect(loginErrorMessage(refusedWith(429))).toBe(TOO_MANY_ATTEMPTS_MESSAGE)
  })

  it('tells a refused (403) sign-in apart from a server failure', () => {
    expect(loginErrorMessage(refusedWith(403, { message: 'Invalid CORS request' }))).toBe(SIGN_IN_REFUSED_MESSAGE)
    expect(loginErrorMessage(refusedWith(500))).toBe(SERVER_PROBLEM_MESSAGE)
    expect(loginErrorMessage(refusedWith(503))).toBe(SERVER_PROBLEM_MESSAGE)
  })

  it('says whether the network or the server is at fault when nothing came back', () => {
    expect(loginErrorMessage(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(NO_CONNECTION_MESSAGE)
    expect(loginErrorMessage(new AxiosError('timeout', 'ECONNABORTED'))).toBe(NO_SERVER_RESPONSE_MESSAGE)
  })
})
