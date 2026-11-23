import { useTranslation } from 'react-i18next'
import { useToastStore } from '../store/toastStore'
import type { Toast, ToastVariant } from '../store/toastStore'
import { IconButton } from './IconButton'

const VARIANT_STYLES: Record<ToastVariant, { border: string; icon: string }> = {
  success: { border: 'border-l-ok',   icon: '✓' },
  error:   { border: 'border-l-bad',  icon: '✕' },
  warning: { border: 'border-l-warn', icon: '⚠' },
  info:    { border: 'border-l-info', icon: 'ℹ' },
}

const ICON_COLOR: Record<ToastVariant, string> = {
  success: 'text-ok',
  error:   'text-bad',
  warning: 'text-warn',
  info:    'text-info',
}

export function ToastContainer() {
  const { t: translate } = useTranslation()
  const { toasts, removeToast } = useToastStore()
  const errors = toasts.filter((t) => t.variant === 'error')
  const updates = toasts.filter((t) => t.variant !== 'error')

  const renderToast = (t: Toast) => {
    const { border, icon } = VARIANT_STYLES[t.variant]
    return (
      <div key={t.id} className={`ui-toast ${border}`}>
        <span aria-hidden="true" className={`ui-toast-icon ${ICON_COLOR[t.variant]}`}>{icon}</span>
        <span className="ui-toast-msg">{t.message}</span>
        <IconButton label={translate('actions.dismiss')} icon="×" onClick={() => removeToast(t.id)} className="ui-toast-close" />
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
