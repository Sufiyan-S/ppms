import { Check, Fuel } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DUOption } from '../../../types/shift'
import { FUEL_BADGE } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { activeNozzlesOf } from './openShiftNozzles'

interface Props {
  du: DUOption
  busyNozzleOperators: ReadonlyMap<number, string>
  isSelected: boolean
  onSelect: (du: DUOption) => void
}

export function DispenserTile({ du, busyNozzleOperators, isSelected, onSelect }: Props) {
  const { t } = useTranslation('shifts')
  const activeNozzles = activeNozzlesOf(du)
  const fuelTypes = [...new Set(activeNozzles.map((n) => n.fuelType))]
  const inUseCount = activeNozzles.filter((n) => busyNozzleOperators.has(n.id)).length
  const freeCount = activeNozzles.length - inUseCount

  const availability = activeNozzles.length === 0 ? t('open.noActiveNozzles')
    : freeCount === 0 ? t('open.allInUse')
    : [t('open.freeCount', { count: freeCount }), inUseCount > 0 && t('open.inUseCount', { count: inUseCount })]
      .filter(Boolean).join(' · ')

  return (
    <button type="button" aria-pressed={isSelected} disabled={freeCount === 0 && !isSelected}
      onClick={() => onSelect(du)} className="ui-choice-tile">
      {isSelected && (
        <span className="ui-choice-tile__check" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
      )}
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true"
          className={`flex size-9 shrink-0 items-center justify-center rounded-control ${isSelected ? 'bg-primary text-on-primary' : 'bg-surface-sunken text-ink-2'}`}>
          <Fuel size={18} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{du.name}</span>
          <span className="block text-xs text-ink-3">{t('open.duNumber', { number: du.duNumber })}</span>
        </span>
      </span>
      {fuelTypes.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {fuelTypes.map((fuel) => (
            <span key={fuel} className={`rounded-badge px-1.5 py-0.5 text-xs font-medium ${FUEL_BADGE[fuel] ?? 'bg-surface-sunken text-ink-2'}`}>
              {codeLabel(fuel)}
            </span>
          ))}
        </span>
      )}
      <span className="text-xs text-ink-2">{availability}</span>
    </button>
  )
}
