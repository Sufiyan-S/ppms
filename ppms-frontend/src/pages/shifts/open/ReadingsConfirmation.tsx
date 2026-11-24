import { useTranslation } from 'react-i18next'

interface Props {
  nozzleCount: number
  isConfirmed: boolean
  onConfirmChange: (checked: boolean) => void
}

export function ReadingsConfirmation({ nozzleCount, isConfirmed, onConfirmChange }: Props) {
  const { t } = useTranslation('shifts')
  if (nozzleCount === 0) {
    return <p className="ui-help mt-0">{t('open.readingsWaiting')}</p>
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">{t('open.readingsSummary', { count: nozzleCount })}</p>
      <p className="ui-help mt-0">
        {t('open.readingsNote')}{' '}
        <span className="font-medium text-ink-2">{t('open.readingsNotePath')}</span>{t('open.readingsNoteEnd')}
      </p>
      <label className="ui-check-row">
        <input type="checkbox" checked={isConfirmed} onChange={(e) => onConfirmChange(e.target.checked)} />
        <span>{t('open.confirmReadings')}</span>
      </label>
    </div>
  )
}
