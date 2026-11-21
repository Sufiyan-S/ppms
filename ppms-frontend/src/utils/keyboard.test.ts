import { describe, expect, it, vi } from 'vitest'
import type { KeyboardEvent } from 'react'
import { onActivateKey } from './keyboard'

function keyEvent(key: string, sameTarget = true) {
  const element = document.createElement('div')
  return {
    key,
    target: sameTarget ? element : document.createElement('span'),
    currentTarget: element,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLElement> & { preventDefault: ReturnType<typeof vi.fn> }
}

describe('onActivateKey', () => {
  it.each(['Enter', ' '])('runs the handler and prevents default for %j', (key) => {
    const handler = vi.fn()
    const event = keyEvent(key)
    onActivateKey(handler)(event)
    expect(handler).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('ignores other keys', () => {
    const handler = vi.fn()
    const event = keyEvent('a')
    onActivateKey(handler)(event)
    expect(handler).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('ignores keys pressed on a nested element so inner buttons keep their own behaviour', () => {
    const handler = vi.fn()
    onActivateKey(handler)(keyEvent('Enter', false))
    expect(handler).not.toHaveBeenCalled()
  })
})
