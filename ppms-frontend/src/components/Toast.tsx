import { useToastStore } from '../store/toastStore'
import type { Toast, ToastVariant } from '../store/toastStore'
import { IconButton } from './IconButton'

const VARIANT_STYLES: Record<ToastVariant, { border: string; icon: string }> = {
  success: { border: 'border-l-emerald-500', icon: '✓' },
  error:   { border: 'border-l-red-500',     icon: '✕' },
  warning: { border: 'border-l-amber-500',   icon: '⚠' },
  info:    { border: 'border-l-blue-500',    icon: 'ℹ' },
}

const ICON_COLOR: Record<ToastVariant, string> = {
  success: 'text-emerald-600',
  error:   'text-red-600',
  warning: 'text-amber-600',
  info:    'text-blue-600',
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()
  const errors = toasts.filter((t) => t.variant === 'error')
  const updates = toasts.filter((t) => t.variant !== 'error')

  const renderToast = (t: Toast) => {
    const { border, icon } = VARIANT_STYLES[t.variant]
    return (
      <div key={t.id} className={`ui-toast ${border}`}>
        <span aria-hidden="true" className={`ui-toast-icon ${ICON_COLOR[t.variant]}`}>{icon}</span>
        <span className="ui-toast-msg">{t.message}</span>
        <IconButton label="Dismiss" icon="×" onClick={() => removeToast(t.id)} className="ui-toast-close" />
      </div>
    )
  }

  // Both live regions stay mounted so screen readers announce the first message too.
  return (
    <div className="ui-toast-stack">
      <div role="alert" aria-atomic="false" className="flex flex-col gap-2">{errors.map(renderToast)}</div>
      <div role="status" aria-live="polite" aria-atomic="false" className="flex flex-col gap-2">{updates.map(renderToast)}</div>
    </div>
  )
}
