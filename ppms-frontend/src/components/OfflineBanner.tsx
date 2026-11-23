import { useSyncExternalStore } from 'react'
import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

function subscribeToConnection(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

function isOnline() {
  return navigator.onLine
}

function isOnlineOnServer() {
  return true
}

export function OfflineBanner() {
  const { t } = useTranslation()
  const online = useSyncExternalStore(subscribeToConnection, isOnline, isOnlineOnServer)

  return (
    <div role="status" aria-live="polite">
      {!online && (
        <p className="ui-alert ui-alert-warning fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 rounded-none px-4 py-2 text-sm font-medium print:hidden">
          <WifiOff size={16} strokeWidth={2} aria-hidden="true" />
          {t('offline')}
        </p>
      )}
    </div>
  )
}
