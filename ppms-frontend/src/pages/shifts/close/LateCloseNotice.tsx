import { Trans, useTranslation } from 'react-i18next'

export function LateCloseNotice({ scheduledEndDisplay }: { scheduledEndDisplay: string }) {
  const { t } = useTranslation('shifts')
  return (
    <div className="flex items-start gap-3 bg-warn-bg border border-warn rounded-card px-4 py-3">
      <svg className="w-4 h-4 text-warn mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 4a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H10z" clipRule="evenodd" />
      </svg>
      <div>
        <p className="text-sm font-semibold text-warn">{t('close.lateClose.title')}</p>
        <p className="text-xs text-warn mt-0.5">
          <Trans t={t} i18nKey="close.lateClose.body" values={{ time: scheduledEndDisplay }}
            components={{ time: <span className="font-semibold" /> }} />
        </p>
      </div>
    </div>
  )
}
