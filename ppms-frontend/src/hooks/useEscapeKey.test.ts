import { fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEscapeKey } from './useEscapeKey'

describe('useEscapeKey', () => {
  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    renderHook(() => useEscapeKey(onClose))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ignores other keys', () => {
    const onClose = vi.fn()
    renderHook(() => useEscapeKey(onClose))
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores Escape that an inner field already handled', () => {
    const onClose = vi.fn()
    renderHook(() => useEscapeKey(onClose))
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.addEventListener('keydown', (event) => event.preventDefault())
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    input.remove()
  })

  it('does nothing while disabled', () => {
    const onClose = vi.fn()
    renderHook(() => useEscapeKey(onClose, false))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stops listening after unmount', () => {
    const onClose = vi.fn()
    const { unmount } = renderHook(() => useEscapeKey(onClose))
    unmount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
