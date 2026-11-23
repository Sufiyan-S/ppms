import { afterEach, describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { NO_CONNECTION_MESSAGE, NO_SERVER_RESPONSE_MESSAGE, parseApiError, serverMessage, translatedErrorCode } from './apiError'
import { changeAppLanguage } from '../i18n'

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

  it('says the connection is down when the request never reached the server', () => {
    expect(parseApiError(new AxiosError('Network Error', 'ERR_NETWORK'), 'Failed to save')).toBe(NO_CONNECTION_MESSAGE)
  })

  it('says the server did not respond when the request timed out', () => {
    expect(parseApiError(new AxiosError('timeout of 20000ms exceeded', 'ECONNABORTED'), 'Failed to save'))
      .toBe(NO_SERVER_RESPONSE_MESSAGE)
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

describe('parseApiError in Hindi and Marathi', () => {
  const creditLimitError = () => axiosError(400, {
    message: "Credit limit exceeded for 'Sharma Transport'.",
    code: 'CREDIT_LIMIT_EXCEEDED',
    params: { clientName: 'Sharma Transport', outstanding: '48000.00', amount: '5000.00', limit: '50000.00' },
  })

  afterEach(async () => {
    await changeAppLanguage('en')
  })

  it('keeps the server\'s own English message for English users', () => {
    expect(parseApiError(creditLimitError())).toBe("Credit limit exceeded for 'Sharma Transport'.")
  })

  it('shows a coded error in the user\'s language with its params filled in', async () => {
    await changeAppLanguage('hi')
    expect(parseApiError(creditLimitError()))
      .toBe("'Sharma Transport' की क्रेडिट सीमा पार हो गई। बकाया (समूह): 48000.00, यह एंट्री: 5000.00, सीमा: 50000.00।")
  })

  it('translates enum codes passed as params', async () => {
    await changeAppLanguage('mr')
    const message = parseApiError(axiosError(400, {
      message: 'Closing reading 90 is below the opening reading 100 for the DIESEL nozzle.',
      code: 'CLOSING_READING_BELOW_OPENING',
      params: { closingReading: '90', openingReading: '100', fuelTypeCode: 'DIESEL' },
    }))
    expect(message).toContain('डिझेल नोझलचे शेवटचे रीडिंग 90')
  })

  it('falls back to the English server message for codes without a translation', async () => {
    await changeAppLanguage('hi')
    expect(parseApiError(axiosError(400, { message: 'Tank is inactive', code: 'NO_SUCH_CODE' }))).toBe('Tank is inactive')
    expect(parseApiError(axiosError(400, { message: 'Shift is not open.' }))).toBe('Shift is not open.')
  })

  it('names the missing record by its translated entity label', async () => {
    await changeAppLanguage('hi')
    expect(parseApiError(axiosError(404, { message: 'Tank not found', code: 'NOT_FOUND', params: { entityCode: 'TANK' } })))
      .toBe('टैंक: रिकॉर्ड नहीं मिला')
  })

  it('names a missing field in readable words when no label is translated for it', async () => {
    await changeAppLanguage('mr')
    expect(parseApiError(axiosError(400, {
      message: 'Validation failed', code: 'FIELD_REQUIRED', params: { fieldCode: 'SORT_ORDER' },
    }))).toBe('Sort order भरणे आवश्यक आहे.')
  })

  it('names a common field by its translated label', async () => {
    await changeAppLanguage('mr')
    expect(parseApiError(axiosError(400, {
      message: 'Validation failed', code: 'FIELD_REQUIRED', params: { fieldCode: 'CASH_COLLECTED' },
    }))).toBe('मिळालेली रोख भरणे आवश्यक आहे.')
  })

  it('translates a code sent outside an error response, and leaves English to the server text', async () => {
    expect(translatedErrorCode('SHIFT_NOT_OPEN', {})).toBeUndefined()
    await changeAppLanguage('hi')
    expect(translatedErrorCode('NOT_FOUND', { entityCode: 'EXPENSE' })).toBe('खर्च: रिकॉर्ड नहीं मिला')
    expect(translatedErrorCode('NO_SUCH_CODE', {})).toBeUndefined()
    expect(translatedErrorCode(null, {})).toBeUndefined()
  })

  it('translates the network and generic fallbacks', async () => {
    await changeAppLanguage('mr')
    expect(parseApiError(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe('इंटरनेट नाही — नेटवर्क तपासा आणि पुन्हा प्रयत्न करा.')
    expect(parseApiError(axiosError(500, { message: 'boom' }))).toBe('काहीतरी चुकले. कृपया पुन्हा प्रयत्न करा.')
  })
})
