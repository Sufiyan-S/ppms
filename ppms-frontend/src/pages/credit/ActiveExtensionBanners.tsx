import { useTranslation } from 'react-i18next'
import type { CreditExtension } from '../../api/creditApi'
import { extensionSummary } from './extensionSummary'

interface ActiveExtensionBannersProps {
  extensions: CreditExtension[]
  canRevoke: boolean
  onRevoke: (extension: CreditExtension) => void
}

export function ActiveExtensionBanners({ extensions, canRevoke, onRevoke }: ActiveExtensionBannersProps) {
  const { t } = useTranslation('credit')
  return extensions.map((ext) => (
    <div key={ext.id} className="mt-3 ui-alert text-sm bg-info-bg border-info/30 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="font-medium text-info">{extensionSummary(ext)}</span>
        <span className="text-xs text-info">{t('extension.expires', { date: ext.expiryDate })}</span>
      </div>
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs text-info italic truncate max-w-xs">{ext.reason}</span>
        {canRevoke && (
          <button type="button" onClick={() => onRevoke(ext)}
            className="ui-btn ui-btn-secondary ui-btn-compact text-bad border-bad/30 hover:bg-bad-bg shrink-0">
            {t('extension.revoke')}
          </button>
        )}
      </div>
    </div>
  ))
}
