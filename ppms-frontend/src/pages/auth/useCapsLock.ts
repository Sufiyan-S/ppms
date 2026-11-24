import { useState } from 'react'
import type { KeyboardEvent } from 'react'

/** Follows Caps Lock through the key events of the field it is attached to. */
export function useCapsLock() {
  const [capsLockOn, setCapsLockOn] = useState(false)
  const checkCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(event.getModifierState('CapsLock'))
  }
  return { capsLockOn, checkCapsLock }
}
