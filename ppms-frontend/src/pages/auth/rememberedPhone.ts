const REMEMBERED_PHONE_KEY = 'ppms_remembered_phone'

/** The phone number saved by "Remember my number"; only ever the number, never the password. */
export function readRememberedPhone(): string | null {
  try {
    const phone = localStorage.getItem(REMEMBERED_PHONE_KEY)
    return phone && /^\d{10}$/.test(phone) ? phone : null
  } catch (error) {
    console.warn('Could not read the remembered phone number on this device', error)
    return null
  }
}

export function rememberPhone(phone: string): void {
  try {
    localStorage.setItem(REMEMBERED_PHONE_KEY, phone)
  } catch (error) {
    console.warn('Could not remember the phone number on this device', error)
  }
}

export function forgetRememberedPhone(): void {
  try {
    localStorage.removeItem(REMEMBERED_PHONE_KEY)
  } catch (error) {
    console.warn('Could not forget the remembered phone number on this device', error)
  }
}
