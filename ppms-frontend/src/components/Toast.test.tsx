import { act, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useToastStore } from '../store/toastStore'
import { ToastContainer } from './Toast'

describe('ToastContainer', () => {
  beforeEach(() => useToastStore.setState({ toasts: [] }))

  it('keeps both live regions in the page before any message arrives', () => {
    render(<ToastContainer />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  })

  it('puts errors in the alert region and other messages in the status region', () => {
    render(<ToastContainer />)
    act(() => {
      useToastStore.getState().addToast('Saved', 'success')
      useToastStore.getState().addToast('Failed to save', 'error')
    })
    expect(within(screen.getByRole('status')).getByText('Saved')).toBeInTheDocument()
    expect(within(screen.getByRole('alert')).getByText('Failed to save')).toBeInTheDocument()
  })
})
