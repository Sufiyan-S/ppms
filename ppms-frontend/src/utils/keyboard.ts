import type { KeyboardEvent } from 'react'

/** Keyboard handler for an element given role="button": Enter and Space run the same action as a click. */
export function onActivateKey(handler: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handler()
    }
  }
}
