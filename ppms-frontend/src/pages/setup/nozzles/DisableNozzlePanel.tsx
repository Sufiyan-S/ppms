import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadingButton } from '../../../components/LoadingButton'

interface Props {
  nozzleNumber: number
  error: string | null
  isPending: boolean
  onDisable: () => void
  onCancel: () => void
}

export function DisableNozzlePanel({ nozzleNumber, error, isPending, onDisable, onCancel }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  const titleId = useId()
  return (
    <div className="px-4 py-3 border-t border-border">
      <section aria-labelledby={titleId} className="ui-disable-editor">
        <div className="ui-disable-editor__hero">
          <div>
            <h3 id={titleId} className="ui-title-sm">{t('nozzles.disable.title', { number: nozzleNumber })}</h3>
            <p className="ui-subtitle mt-1">{t('nozzles.disable.subtitle')}</p>
          </div>
        </div>
        <p className="text-sm text-ink-2">{t('nozzles.disable.warning')}</p>
        {error && <p role="alert" className="ui-error-text">{error}</p>}
        <div className="ui-disable-editor__actions">
          <LoadingButton
            type="button"
            onClick={onDisable}
            isLoading={isPending}
            loadingLabel={t('nozzles.disable.disabling')}
            className="ui-btn-danger"
          >
            {t('nozzles.disable.confirm')}
          </LoadingButton>
          <button type="button" onClick={onCancel} className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
        </div>
      </section>
    </div>
  )
}
