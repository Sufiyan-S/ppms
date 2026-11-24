import { useId } from 'react'
import { Check, Fuel, Plus, PauseCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TankInfo } from '../../../api/pumpApi'
import type { DUOption } from '../../../types/shift'
import { StatusBadge } from '../../../components/StatusBadge'
import type { NozzlePanel } from './nozzlePanels'
import { NozzleTile } from './NozzleTile'
import { AddNozzleForm } from './AddNozzleForm'

const MAX_NOZZLES_PER_DU = 9

interface Props {
  pumpId: number
  du: DUOption
  tanks: TankInfo[]
  openPanelFor: (nozzleId: number) => NozzlePanel | null
  onOpenPanel: (nozzleId: number, panel: NozzlePanel) => void
  onClosePanel: () => void
  openMenu: number | null
  onMenuChange: (nozzleId: number | null) => void
  statusPending: boolean
  statusError: string | null
  onStatusChange: (nozzleId: number, status: 'ACTIVE' | 'INACTIVE') => void
  addingNozzle: boolean
  onStartAddNozzle: () => void
  onStopAddNozzle: () => void
}

/** One dispenser: its name, number, status and nozzle count, then a tile for each nozzle. */
export function DuCard({
  pumpId, du, tanks, openPanelFor, onOpenPanel, onClosePanel,
  openMenu, onMenuChange, statusPending, statusError, onStatusChange, addingNozzle, onStartAddNozzle, onStopAddNozzle,
}: Props) {
  const { t } = useTranslation('setup')
  const headingId = useId()
  const isInactive = du.status === 'INACTIVE'
  const activeCount = du.nozzles.filter((n) => n.status === 'ACTIVE').length
  const canAddNozzle = !isInactive && du.nozzles.length < MAX_NOZZLES_PER_DU && !addingNozzle

  return (
    <article aria-labelledby={headingId} className={`ui-card-plain ${isInactive ? 'bg-bg' : ''}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center rounded-control ${isInactive ? 'bg-surface-sunken text-ink-3' : 'bg-info-bg text-primary'}`}>
          <Fuel size={20} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={headingId} className="text-sm font-semibold text-ink">{du.name}</h3>
            <span className="text-xs font-medium text-ink-3">{t('nozzles.du.number', { number: du.duNumber })}</span>
            {isInactive
              ? <StatusBadge tone="warn" icon={PauseCircle} label={t('nozzles.du.inactive')} />
              : <StatusBadge tone="ok" icon={Check} label={t('nozzles.active')} />}
          </div>
          <p className="mt-0.5 text-xs text-ink-2">{t('nozzles.du.nozzleSummary', { count: du.nozzles.length, active: activeCount })}</p>
        </div>
        {canAddNozzle && (
          <button type="button" onClick={onStartAddNozzle} className="ui-btn ui-btn-secondary ui-btn-compact">
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
            {t('nozzles.du.addNozzle')}
          </button>
        )}
      </header>

      {du.nozzles.length > 0 && (
        <ul aria-label={t('nozzles.du.nozzlesOf', { name: du.name })} className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {du.nozzles.map((nozzle) => (
            <NozzleTile
              key={nozzle.id}
              pumpId={pumpId}
              du={du}
              nozzle={nozzle}
              tanks={tanks}
              openPanel={openPanelFor(nozzle.id)}
              onOpenPanel={(panel) => onOpenPanel(nozzle.id, panel)}
              onClosePanel={onClosePanel}
              menuOpen={openMenu === nozzle.id}
              onMenuChange={onMenuChange}
              statusPending={statusPending}
              statusError={statusError}
              onEnable={() => onStatusChange(nozzle.id, 'ACTIVE')}
              onDisable={() => onStatusChange(nozzle.id, 'INACTIVE')}
            />
          ))}
        </ul>
      )}

      {addingNozzle && <AddNozzleForm pumpId={pumpId} du={du} onClose={onStopAddNozzle} />}
    </article>
  )
}
