import { create } from 'zustand'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, variant?: ToastVariant) => void
  removeToast: (id: number) => void
}

let nextId = 0

export const useToastStore = create<ToastState>(set => ({
  toasts: [],
  addToast: (message, variant = 'success') => {
    const id = ++nextId
    set(s => ({ toasts: [...s.toasts, { id, message, variant }] }))
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
    }, 4000)
  },
  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))
