import { useTranslation } from 'react-i18next'
import { Page } from '../../../components/layout/Page'

interface SuspendedPumpNoticeProps {
  canSwitchPump: boolean
  isStaff: boolean
}

export function SuspendedPumpNotice({ canSwitchPump, isStaff }: SuspendedPumpNoticeProps) {
  const { t } = useTranslation('nav')
  if (isStaff && !canSwitchPump) {
    return (
      <Page>
        <div role="alert" className="ui-card max-w-xl mx-auto text-center space-y-2">
          <h1 className="text-lg font-bold text-ink">{t('suspended.yourPumpTitle')}</h1>
          <p className="text-sm text-ink-2">{t('suspended.yourPumpBody')}</p>
        </div>
      </Page>
    )
  }
  return (
    <Page>
      <div role="alert" className="ui-card max-w-xl mx-auto text-center space-y-2">
        <h1 className="text-lg font-bold text-ink">{t('suspended.thisPumpTitle')}</h1>
        <p className="text-sm text-ink-2">
          {t('suspended.thisPumpBody')}
          {canSwitchPump ? t('suspended.chooseAnotherPump') : t('suspended.contactOwnerOrSupport')}
        </p>
      </div>
    </Page>
  )
}
