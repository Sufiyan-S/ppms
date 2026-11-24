import { Check, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { NozzleDetail } from '../../../types/shift'
import { StatusBadge } from '../../../components/StatusBadge'
import { FUEL_STOCK_COLORS } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { formatMeterReading } from './openShiftNozzles'

interface Props {
  nozzle: NozzleDetail
  isBusy: boolean
  /** Who has the nozzle on an open shift; empty when the shift data does not say. */
  busyOperatorName: string | undefined
  isSelected: boolean
  onToggle: (nozzle: NozzleDetail) => void
}

export function NozzleTile({ nozzle, isBusy, busyOperatorName, isSelected, onToggle }: Props) {
  const { t } = useTranslation('shifts')
  return (
    <button type="button" aria-pressed={isSelected} disabled={isBusy}
      onClick={() => onToggle(nozzle)} className="ui-choice-tile pl-4">
      <span aria-hidden="true" className={`ui-choice-tile__fuel-bar ${FUEL_STOCK_COLORS[nozzle.fuelType]?.bar ?? 'bg-ink-3'}`} />
      {isSelected && (
        <span className="ui-choice-tile__check" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
      )}
      <span className="text-2xl font-semibold tabular-nums">#{nozzle.nozzleNumber}</span>
      <span className="text-sm font-medium text-ink-2">{codeLabel(nozzle.fuelType)}</span>
      <span className="text-xs text-ink-3 tabular-nums">{t('open.meterReading', formatMeterReading(nozzle))}</span>
      {isBusy && (
        <StatusBadge tone="neutral" icon={Lock} wrap
          label={busyOperatorName ? t('open.inUseBy', { name: busyOperatorName }) : t('open.inUse')} />
      )}
    </button>
  )
}
