import { useTranslation } from 'react-i18next'
import type { PriceDeviationWarning } from '../../../api/pumpApi'
import { MoneyText } from '../../../components/AmountText'
import { LiveFigures } from '../../../components/LiveFigures'
import { Modal } from '../../../components/Modal'
import { FUEL_UNIT } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { formatPercent } from './formatPercent'

export type DeviationWarning = PriceDeviationWarning & { fuelType: string }

interface Props {
  warning: DeviationWarning
  onEdit: () => void
  onConfirm: () => void
}

/** Asks before saving a price far from the last one, showing both prices and the change. */
export function PriceDeviationDialog({ warning, onEdit, onConfirm }: Props) {
  const { t } = useTranslation('setup')
  const change = warning.newPrice - warning.lastPrice
  const unit = FUEL_UNIT[warning.fuelType] ?? 'L'
  const signedPercent = change < 0 ? -Math.abs(warning.deviationPercent) : Math.abs(warning.deviationPercent)

  return (
    <Modal
      title={t('prices.deviation.title')}
      subtitle={warning.fuelType ? codeLabel(warning.fuelType) : undefined}
      tone="warning"
      size="md"
      onClose={onEdit}
      bodyClassName="space-y-4"
      footer={
        <>
          <button type="button" onClick={onEdit} className="ui-btn ui-btn-secondary">
            {t('prices.deviation.edit')}
          </button>
          <button type="button" onClick={onConfirm} data-autofocus className="ui-btn ui-btn-primary">
            {t('prices.deviation.confirm')}
          </button>
        </>
      }
    >
      {warning.message && <p className="text-sm text-ink-2">{warning.message}</p>}
      <LiveFigures
        figures={[
          { label: t('prices.deviation.lastPrice'), value: <><MoneyText value={warning.lastPrice} />/{unit}</> },
          { label: t('prices.deviation.newPrice'), value: <><MoneyText value={warning.newPrice} />/{unit}</> },
          {
            label: t('prices.deviation.deviation'),
            value: <span className="text-warn"><MoneyText value={change} showSign /> ({formatPercent(signedPercent)})</span>,
            isResult: true,
          },
        ]}
      />
      <p className="text-xs text-ink-3">{t('prices.deviation.body')}</p>
    </Modal>
  )
}
