import { useRef } from 'react'
import { AlertTriangle, Check, CircleOff, Database, Ruler, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TankInfo } from '../../../api/pumpApi'
import type { DUOption, NozzleDetail } from '../../../types/shift'
import { Spinner } from '../../../components/Spinner'
import { RowActionMenu } from '../../../components/RowActionMenu'
import { StatusBadge } from '../../../components/StatusBadge'
import { useRowPanelFocus } from '../../../hooks/useRowPanelFocus'
import { FUEL_STOCK_COLORS } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { formatMeterReading } from '../../shifts/open/openShiftNozzles'
import type { NozzlePanel } from './nozzlePanels'
import { DisableNozzlePanel } from './DisableNozzlePanel'
import { MapTankPanel } from './MapTankPanel'
import { AdjustReadingPanel } from './AdjustReadingPanel'
import { RecordDipPanel } from './RecordDipPanel'

interface Props {
  pumpId: number
  du: DUOption
  nozzle: NozzleDetail
  tanks: TankInfo[]
  openPanel: NozzlePanel | null
  onOpenPanel: (panel: NozzlePanel) => void
  onClosePanel: () => void
  menuOpen: boolean
  onMenuChange: (nozzleId: number | null) => void
  statusPending: boolean
  statusError: string | null
  onEnable: () => void
  onDisable: () => void
}

/**
 * One nozzle as a tile like the Open Shift nozzle tiles: fuel stripe, number, fuel, meter reading, linked tank and
 * status, with its actions menu. An opened action's panel spans the whole row of tiles below it.
 */
export function NozzleTile({
  pumpId, du, nozzle, tanks, openPanel, onOpenPanel, onClosePanel,
  menuOpen, onMenuChange, statusPending, statusError, onEnable, onDisable,
}: Props) {
  const { t } = useTranslation(['setup', 'common'])
  const isInactive = nozzle.status === 'INACTIVE'
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLLIElement>(null)
  useRowPanelFocus(openPanel, panelRef, menuButtonRef)
  const tank = tanks.find((entry) => entry.id === nozzle.tankId) ?? null
  const fuelName = codeLabel(nozzle.fuelType)

  return (
    <>
      <li
        aria-label={t('nozzles.tile.label', { number: nozzle.nozzleNumber, fuel: fuelName })}
        className={`ui-card-plain relative flex min-w-0 flex-col items-start gap-1 p-3 pl-4 pr-12 ${isInactive ? 'bg-surface-sunken' : ''} ${openPanel ? 'border-primary' : ''}`}
      >
        <span aria-hidden="true" className={`ui-choice-tile__fuel-bar ${isInactive ? 'bg-ink-3' : FUEL_STOCK_COLORS[nozzle.fuelType]?.bar ?? 'bg-ink-3'}`} />
        <span className={`text-2xl font-semibold tabular-nums ${isInactive ? 'text-ink-3' : 'text-ink'}`}>#{nozzle.nozzleNumber}</span>
        <span className="text-sm font-medium text-ink-2">{fuelName}</span>
        <span className="text-xs text-ink-3 tabular-nums">{t('nozzles.tile.meter', formatMeterReading(nozzle))}</span>
        {tank ? (
          <span className="text-xs text-ink-2">{t('nozzles.tile.tank', { name: tank.tankIdentifier })}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-warn">
            <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
            {t('nozzles.row.tankNotMapped')}
          </span>
        )}
        {isInactive
          ? <StatusBadge tone="warn" icon={Wrench} label={t('nozzles.row.maintenance')} className="mt-1" />
          : <StatusBadge tone="ok" icon={Check} label={t('nozzles.active')} className="mt-1" />}

        <div className="absolute right-2 top-2">
          {isInactive ? (
            <button type="button" onClick={onEnable} disabled={statusPending} className="ui-btn ui-btn-secondary ui-btn-compact">
              {statusPending ? <span className="flex items-center gap-1"><Spinner className="h-3 w-3" />{t('actions.enabling')}</span> : t('common:actions.enable')}
            </button>
          ) : (
            <RowActionMenu
              label={t('nozzles.row.actionsFor', { number: nozzle.nozzleNumber })}
              open={menuOpen}
              onOpenChange={(open) => onMenuChange(open ? nozzle.id : null)}
              triggerRef={menuButtonRef}
              triggerClassName="ui-btn ui-btn-ghost text-base leading-none text-ink-2 hover:text-ink"
              menuClassName="absolute right-0 top-full z-6 mt-2 w-56 overflow-hidden rounded-card border border-border bg-surface p-1.5 shadow-overlay"
              items={[
                { key: 'mapTank', label: t('nozzles.row.mapTank'), description: t('nozzles.row.mapTankHint'), icon: <Database size={14} strokeWidth={2} />, className: 'text-ok hover:bg-ok-bg', onSelect: () => onOpenPanel('mapTank') },
                { key: 'reading', label: t('nozzles.row.adjustReading'), description: t('nozzles.row.adjustReadingHint'), icon: <Wrench size={14} strokeWidth={2} />, className: 'text-info hover:bg-info-bg', onSelect: () => onOpenPanel('reading') },
                { key: 'dip', label: t('nozzles.row.recordDip'), description: t('nozzles.row.recordDipHint'), icon: <Ruler size={14} strokeWidth={2} />, className: 'text-warn hover:bg-warn-bg', onSelect: () => onOpenPanel('dip') },
                { key: 'disable', label: t('nozzles.row.disable'), description: t('nozzles.row.disableHint'), icon: <CircleOff size={14} strokeWidth={2} />, className: 'text-bad hover:bg-bad-bg', onSelect: () => onOpenPanel('disable') },
              ]}
            />
          )}
        </div>
      </li>

      {openPanel && (
        <li ref={panelRef} className="col-span-full">
          {openPanel === 'disable' && (
            <DisableNozzlePanel nozzleNumber={nozzle.nozzleNumber} error={statusError} isPending={statusPending} onDisable={onDisable} onCancel={onClosePanel} />
          )}
          {openPanel === 'mapTank' && <MapTankPanel pumpId={pumpId} duId={du.id} nozzle={nozzle} tanks={tanks} onClose={onClosePanel} />}
          {openPanel === 'reading' && <AdjustReadingPanel pumpId={pumpId} nozzle={nozzle} onClose={onClosePanel} />}
          {openPanel === 'dip' && <RecordDipPanel pumpId={pumpId} nozzle={nozzle} tank={tank} onClose={onClosePanel} />}
        </li>
      )}
    </>
  )
}
