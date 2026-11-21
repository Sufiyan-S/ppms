// Same rules as the backend (GstFields): checked here only to show the error before saving.
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const HSN_CODE_PATTERN = /^[0-9]{4,8}$/
const INVOICE_PREFIX_PATTERN = /^[A-Z0-9]{1,5}$/

export function normaliseGstText(value: string): string {
  return value.trim().toUpperCase()
}

/** An empty value is allowed: it means "not registered" or "clear it". */
export function isValidGstin(value: string): boolean {
  const gstin = normaliseGstText(value)
  return gstin === '' || GSTIN_PATTERN.test(gstin)
}

export function isValidHsnCode(value: string): boolean {
  const hsnCode = value.trim()
  return hsnCode === '' || HSN_CODE_PATTERN.test(hsnCode)
}

export function isValidInvoicePrefix(value: string): boolean {
  const prefix = normaliseGstText(value)
  return prefix === '' || INVOICE_PREFIX_PATTERN.test(prefix)
}

export const GSTIN_FORMAT_MESSAGE = 'GSTIN must be 15 characters in the format 27ABCDE1234F1Z5.'
