import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useConfirmDiscard } from './useConfirmDiscard'

describe('useConfirmDiscard', () => {
  it('closes straight away when nothing has been entered', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useConfirmDiscard(false, onClose))
    act(() => result.current.requestClose())
    expect(result.current.isConfirming).toBe(false)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('asks in the app instead of the browser dialog when details were entered', () => {
    const onClose = vi.fn()
    const browserConfirm = vi.spyOn(window, 'confirm')
    const { result } = renderHook(() => useConfirmDiscard(true, onClose))
    act(() => result.current.requestClose())
    expect(result.current.isConfirming).toBe(true)
    expect(browserConfirm).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes when the user chooses to discard', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useConfirmDiscard(true, onClose))
    act(() => result.current.requestClose())
    act(() => result.current.discard())
    expect(result.current.isConfirming).toBe(false)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('stays open when the user keeps editing', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useConfirmDiscard(true, onClose))
    act(() => result.current.requestClose())
    act(() => result.current.keepEditing())
    expect(result.current.isConfirming).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })
})
