export const PORTAL_PIN_PATTERN = /^\d{4,6}$/

export const digitsOnly = (value: string) => value.replace(/\D/g, '')
