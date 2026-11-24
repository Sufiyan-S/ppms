import { AlertTriangle, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FuelPrice } from '../../../api/pumpApi'
import { LoadingButton } from '../../../components/LoadingButton'
import { formatIstDate } from '../../../utils/date'

interface Props {
  currentPrices: FuelPrice[]
  isConfirming: boolean
  disabled: boolean
  onConfirmSamePrices: () => void
}

/** Shown when no price was set today, with a one-tap way to keep yesterday's prices. */
export function StalePricesAlert({ currentPrices, isConfirming, disabled, onConfirmSamePrices }: Props) {
  const { t } = useTranslation('setup')
  const lastUpdatedOn = currentPrices.reduce((latest, p) =>
    p.effectiveFrom > latest ? p.effectiveFrom : latest, currentPrices[0].effectiveFrom)

  return (
    <div role="status" className="ui-alert ui-alert-warning flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{t('prices.staleTitle')}</p>
          <p className="text-xs mt-0.5">
            {t('prices.lastUpdatedOn')}{' '}
            <span className="font-medium">{formatIstDate(lastUpdatedOn)}</span>
            {t('prices.staleHint')}
          </p>
        </div>
      </div>
      <LoadingButton type="button" onClick={onConfirmSamePrices}
        isLoading={isConfirming} loadingLabel={t('prices.confirming')}
        disabled={disabled}
        className="ui-btn-secondary ui-btn-compact shrink-0 gap-1.5">
        <Check size={14} strokeWidth={2.5} aria-hidden="true" />{t('prices.samePrices')}
      </LoadingButton>
    </div>
  )
}
