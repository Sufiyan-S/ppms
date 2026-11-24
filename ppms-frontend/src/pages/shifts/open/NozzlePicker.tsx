import { useTranslation } from 'react-i18next'
import type { NozzleDetail } from '../../../types/shift'
import { NozzleTile } from './NozzleTile'

interface Props {
  nozzles: NozzleDetail[]
  busyNozzleOperators: ReadonlyMap<number, string>
  selectedIds: ReadonlySet<number>
  allFreeSelected: boolean
  onToggle: (nozzle: NozzleDetail) => void
  onSelectAllFree: () => void
  onClear: () => void
  onContinue: () => void
}

export function NozzlePicker({
  nozzles, busyNozzleOperators, selectedIds, allFreeSelected, onToggle, onSelectAllFree, onClear, onContinue,
}: Props) {
  const { t } = useTranslation('shifts')
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-3" aria-live="polite">
          {selectedIds.size > 0 && t('open.selectedCount', { count: selectedIds.size })}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onSelectAllFree} disabled={allFreeSelected}
            className="ui-btn ui-btn-secondary ui-btn-compact min-h-11">
            {t('open.selectAllFree')}
          </button>
          <button type="button" onClick={onClear} disabled={selectedIds.size === 0}
            className="ui-btn ui-btn-ghost ui-btn-compact min-h-11">
            {t('open.clearNozzles')}
          </button>
        </div>
      </div>
      <div role="group" aria-label={t('open.selectNozzles')} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {nozzles.map((nozzle) => (
          <NozzleTile key={nozzle.id} nozzle={nozzle}
            isBusy={busyNozzleOperators.has(nozzle.id)} busyOperatorName={busyNozzleOperators.get(nozzle.id)}
            isSelected={selectedIds.has(nozzle.id)} onToggle={onToggle} />
        ))}
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onContinue} disabled={selectedIds.size === 0}
          className="ui-btn ui-btn-secondary min-h-11">
          {t('open.continue')}
        </button>
      </div>
    </div>
  )
}
