import { useTranslation } from 'react-i18next'
import type { DUOption } from '../../../types/shift'
import { DispenserTile } from './DispenserTile'

interface Props {
  isLoading: boolean
  dispensers: DUOption[]
  busyNozzleOperators: ReadonlyMap<number, string>
  selectedId: number | undefined
  onSelect: (du: DUOption) => void
}

const SKELETON_TILE_COUNT = 3

export function DispenserPicker({ isLoading, dispensers, busyNozzleOperators, selectedId, onSelect }: Props) {
  const { t } = useTranslation('shifts')

  if (isLoading) {
    return (
      <div role="status" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <span className="sr-only">{t('open.loadingDus')}</span>
        {Array.from({ length: SKELETON_TILE_COUNT }, (_, index) => (
          <div key={index} aria-hidden="true" className="ui-choice-tile">
            <span className="ui-skeleton" style={{ height: 36, width: 36 }} />
            <span className="ui-skeleton" style={{ height: 12, width: '70%' }} />
            <span className="ui-skeleton" style={{ height: 10, width: '45%' }} />
          </div>
        ))}
      </div>
    )
  }

  if (dispensers.length === 0) {
    return <p className="ui-alert ui-alert-warning text-sm">{t('open.noDus')}</p>
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {dispensers.map((du) => (
        <DispenserTile key={du.id} du={du} busyNozzleOperators={busyNozzleOperators}
          isSelected={du.id === selectedId} onSelect={onSelect} />
      ))}
    </div>
  )
}
