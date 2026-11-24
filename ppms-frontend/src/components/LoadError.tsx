import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface LoadErrorProps {
  onRetry: () => void
  message?: string
  className?: string
}

/** Shown in place of a list or figures whose request failed, so a failed load never reads as "nothing here". */
export function LoadError({ onRetry, message, className = '' }: LoadErrorProps) {
  const { t } = useTranslation()
  return (
    <div role="alert" className={`ui-alert ui-alert-danger flex flex-wrap items-center gap-3 text-sm ${className}`}>
      <AlertTriangle size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0">{message ?? t('loadError.message')}</span>
      <button type="button" onClick={onRetry} className="ui-btn ui-btn-secondary min-h-0 px-3 py-1 text-xs">
        {t('actions.retry')}
      </button>
    </div>
  )
}
