import { useToastStore } from '../store/toastStore'
import type { ToastVariant } from '../store/toastStore'

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

  if (toasts.length === 0) return null

  return (
    <div className="ui-toast-stack">
      {toasts.map(t => {
        const { border, icon } = VARIANT_STYLES[t.variant]
        return (
          <div key={t.id} className={`ui-toast ${border}`}>
            <span className={`ui-toast-icon ${ICON_COLOR[t.variant]}`}>{icon}</span>
            <span className="ui-toast-msg">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="ui-toast-close"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
