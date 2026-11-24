import { useTranslation } from 'react-i18next'
import { StickyActions } from '../../components/layout/StickyActions'
import { LoadingButton } from '../../components/LoadingButton'

interface Props {
  hasChanges: boolean
  isSaving: boolean
  saveLabel: string
  error: string | null
}

/** The form's save button stays at the bottom of the screen and only turns on once something has been changed. */
export function SetupSaveBar({ hasChanges, isSaving, saveLabel, error }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  return (
    <StickyActions className="items-center bg-surface">
      <div className="mr-auto min-h-5" aria-live="polite">
        {error
          ? <p role="alert" className="ui-error-text mt-0">{error}</p>
          : hasChanges && <p className="ui-save-bar__note text-xs font-medium text-warn">{t('saveBar.unsaved')}</p>}
      </div>
      <LoadingButton type="submit" isLoading={isSaving} loadingLabel={t('common:actions.saving')}
        disabled={!hasChanges} className="ui-btn-primary">
        {saveLabel}
      </LoadingButton>
    </StickyActions>
  )
}
