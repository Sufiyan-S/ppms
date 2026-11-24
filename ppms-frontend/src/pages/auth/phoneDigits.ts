const PHONE_LENGTH = 10

/** Keeps the 10 digits of an Indian mobile number, dropping a pasted +91 or leading 0. */
export function phoneDigits(text: string): string {
  const digits = text.replace(/\D/g, '')
  if (digits.length === PHONE_LENGTH + 2 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === PHONE_LENGTH + 1 && digits.startsWith('0')) return digits.slice(1)
  return digits.slice(0, PHONE_LENGTH)
}

/** "9876543210" is shown as "98765 43210". */
export function groupPhoneDigits(digits: string): string {
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits
}

export function isCompletePhone(digits: string): boolean {
  return /^\d{10}$/.test(digits)
}
