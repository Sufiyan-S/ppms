import { useTranslation } from 'react-i18next'
import { LoadingButton } from '../../components/LoadingButton'
import { RowPanel, RowPanelActions } from '../setup/staff/RowPanel'

interface DisableProductPanelProps {
  isPending: boolean
  onDisable: () => void
  onCancel: () => void
}

export function DisableProductPanel({ isPending, onDisable, onCancel }: DisableProductPanelProps) {
  const { t } = useTranslation(['ancillary', 'common'])
  return (
    <RowPanel title={t('products.disablePrompt')} hint={t('products.menu.disableHint')}>
      <RowPanelActions>
        <button type="button" onClick={onCancel} className="ui-btn ui-btn-secondary ui-btn-compact min-h-11 md:min-h-8">
          {t('common:actions.cancel')}
        </button>
        <LoadingButton type="button" isLoading={isPending} loadingLabel={t('common:actions.saving')} onClick={onDisable}
          className="ui-btn-danger ui-btn-compact min-h-11 md:min-h-8">
          {t('common:actions.disable')}
        </LoadingButton>
      </RowPanelActions>
    </RowPanel>
  )
}
