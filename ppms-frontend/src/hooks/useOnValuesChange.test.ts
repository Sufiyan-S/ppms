import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useOnValuesChange } from './useOnValuesChange'

describe('useOnValuesChange', () => {
  it('does not run on the first render', () => {
    const onChange = vi.fn()
    renderHook(() => useOnValuesChange([1, 'a'], onChange))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('runs once when a value changes and not again for the same values', () => {
    const onChange = vi.fn()
    const { rerender } = renderHook(({ value }) => useOnValuesChange([value], onChange), { initialProps: { value: 1 } })
    rerender({ value: 2 })
    expect(onChange).toHaveBeenCalledOnce()
    rerender({ value: 2 })
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('compares objects by identity', () => {
    const onChange = vi.fn()
    const data = { id: 1 }
    const { rerender } = renderHook(({ value }) => useOnValuesChange([value], onChange), { initialProps: { value: data } })
    rerender({ value: data })
    expect(onChange).not.toHaveBeenCalled()
    rerender({ value: { id: 1 } })
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('runs when the number of values changes', () => {
    const onChange = vi.fn()
    const { rerender } = renderHook(({ values }) => useOnValuesChange(values, onChange), { initialProps: { values: [1] as unknown[] } })
    rerender({ values: [1, undefined] })
    expect(onChange).toHaveBeenCalledOnce()
  })
})
