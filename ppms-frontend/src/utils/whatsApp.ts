/** An Indian mobile number in the 91XXXXXXXXXX form wa.me expects, or null when the number is not one. */
export function whatsAppNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return null
}

/** A link that opens WhatsApp with the message typed in for the number; null when the phone cannot be used. */
export function whatsAppShareUrl(phone: string | null | undefined, message: string): string | null {
  const number = whatsAppNumber(phone)
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null
}
