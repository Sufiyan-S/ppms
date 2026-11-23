import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TankInfo } from '../../../api/pumpApi'
import type { DUOption } from '../../../types/shift'
import { onActivateKey } from '../../../utils/keyboard'
import type { NozzlePanel } from './nozzlePanels'
import { NozzleRow } from './NozzleRow'
import { AddNozzleForm } from './AddNozzleForm'
import { StatusBadge } from '../../../components/StatusBadge'

interface Props {
  pumpId: number
  du: DUOption
  isExpanded: boolean
  onToggle: () => void
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

export function DuCard({
  pumpId, du, isExpanded, onToggle, tanks, openPanelFor, onOpenPanel, onClosePanel,
  openMenu, onMenuChange, statusPending, statusError, onStatusChange, addingNozzle, onStartAddNozzle, onStopAddNozzle,
}: Props) {
  const { t } = useTranslation('setup')
  const isDUInactive = du.status === 'INACTIVE'
  return (
    <div key={du.id} className={`border rounded-card bg-surface transition-opacity ${isDUInactive ? 'border-border opacity-60' : 'border-border'}`}>
      {/* DU header — click to expand/collapse */}
      <div
        className={`flex items-center justify-between px-4 py-3 bg-bg border-border cursor-pointer select-none ${isExpanded ? 'rounded-t-card border-b' : 'rounded-card'}`}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={onActivateKey(onToggle)}
      >
        <div className="flex items-center gap-2">
          <ChevronRight size={14} strokeWidth={2} className={`transition-transform duration-200 text-ink-3 ${isExpanded ? 'rotate-90' : ''}`} />
          <span className="text-xs font-bold text-ink-3">{t('nozzles.du.number', { number: du.duNumber })}</span>
          <span className="text-sm font-bold text-ink">{du.name}</span>
          {isDUInactive && (
            <StatusBadge tone="warn" label={t('nozzles.du.inactive')} />
          )}
        </div>
        <span className="text-xs text-ink-3">{t('nozzles.du.activeNozzles', { count: du.nozzles.filter((n) => n.status === 'ACTIVE').length })}</span>
      </div>


      {/* Nozzle rows + inline add form — only when expanded */}
      {isExpanded && (<>
      <div className="divide-y divide-border">
        {du.nozzles.map((nozzle) => (
          <NozzleRow
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
      </div>

      {/* Add Nozzle action row */}
      {!isDUInactive && du.nozzles.length < 9 && !addingNozzle && (
        <button
          type="button"
          onClick={onStartAddNozzle}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-ink-3 hover:text-primary hover:bg-info-bg border-t border-dashed border-border transition-colors rounded-b-card"
        >
          <span className="text-base leading-none">+</span>
          {t('nozzles.du.addNozzle')}
        </button>
      )}

      {/* Inline add-nozzle form */}
      {addingNozzle && <AddNozzleForm pumpId={pumpId} du={du} onClose={onStopAddNozzle} />}
      </>)}
    </div>
  )
}
