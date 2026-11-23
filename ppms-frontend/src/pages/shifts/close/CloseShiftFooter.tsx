import { useTranslation } from 'react-i18next'

interface Props {
  canReview: boolean
  isHandover?: boolean
  /** The "Still needed" list that says why Review is not available yet. */
  stillNeededId: string
  onCancel: () => void
}

export function CloseShiftFooter({ canReview, isHandover = false, stillNeededId, onCancel }: Props) {
  const { t } = useTranslation(['shifts', 'common'])
  return (
    <div className="flex gap-3 sm:justify-end">
      <button type="button" onClick={onCancel} className="ui-btn ui-btn-secondary flex-1 sm:flex-none">
        {t('common:actions.cancel')}
      </button>
      <button type="submit" disabled={!canReview} aria-describedby={canReview ? undefined : stillNeededId}
        className="ui-btn ui-btn-primary flex-[2] sm:min-w-40 sm:flex-none">
        {isHandover ? t('close.footer.reviewHandover') : t('close.footer.reviewClose')}
      </button>
    </div>
  )
}
