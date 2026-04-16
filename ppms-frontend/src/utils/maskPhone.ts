/**
 * Masks a phone number showing only the last 4 digits.
 * e.g. "9876543210" → "•••••• 3210"
 * Returns the original string unchanged if it's shorter than 4 chars.
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return phone
  return `•••••• ${phone.slice(-4)}`
}
