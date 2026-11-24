import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, Fuel, PauseCircle, Ruler } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../../api/pumpApi'
import type { TankInfo } from '../../../api/pumpApi'
import { FUEL_BADGE, FUEL_STOCK_COLORS, FUEL_UNIT } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { formatNumberIn } from '../../../i18n/format'
import { parseApiError } from '../../../utils/apiError'
import { formatIstDate } from '../../../utils/date'
import { ConfirmButton } from '../../../components/ConfirmButton'
import { StatusBadge } from '../../../components/StatusBadge'
import { EditTankForm } from './EditTankForm'
import { TankGauge } from './TankGauge'
import { useInvalidateTanks } from './tankFormat'

interface TankCardProps {
  pumpId: number
  tank: TankInfo
  /** The inventory's own low-stock flag; unknown until the stock levels load. */
  isLow: boolean
  lastDipAt: string | undefined
  mappedNozzleCount: number
  isEditing: boolean
  onEditingChange: (editing: boolean) => void
}

/** One underground tank: fuel, how full it is, its nozzles and last dip, with edit and disable. */
export function TankCard({ pumpId, tank, isLow, lastDipAt, mappedNozzleCount, isEditing, onEditingChange }: TankCardProps) {
  const { t } = useTranslation(['setup', 'common'])
  const invalidateTanks = useInvalidateTanks(pumpId)
  const [statusError, setStatusError] = useState<string | null>(null)
  const isInactive = tank.status === 'INACTIVE'
  const isEmpty = !isInactive && Number(tank.currentStock) <= 0
  const unit = FUEL_UNIT[tank.fuelType] ?? 'L'
  const stockShare = tank.capacity > 0 ? tank.currentStock / tank.capacity : 0

  const statusMutation = useMutation({
    mutationFn: (status: 'ACTIVE' | 'INACTIVE') => pumpApi.updateTankStatus(pumpId, tank.id, status),
    onSuccess: () => { setStatusError(null); invalidateTanks() },
    onError: (err) => setStatusError(parseApiError(err, t('tanks.statusFailed'))),
  })
  const changeStatus = (status: 'ACTIVE' | 'INACTIVE') => { setStatusError(null); statusMutation.mutate(status) }

  return (
    <article
      aria-label={t('tanks.cardLabel', { name: tank.tankIdentifier, fuel: codeLabel(tank.fuelType) })}
      className={`ui-card-plain relative flex flex-col gap-3 p-4 pl-5 ${isInactive ? 'bg-bg' : ''}`}
    >
      <span aria-hidden="true" className={`ui-choice-tile__fuel-bar ${isInactive ? 'bg-ink-3' : FUEL_STOCK_COLORS[tank.fuelType]?.bar ?? 'bg-ink-3'}`} />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={`truncate text-sm font-semibold ${isInactive ? 'text-ink-3' : 'text-ink'}`}>{tank.tankIdentifier}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-badge px-2 py-0.5 text-xs font-semibold ${FUEL_BADGE[tank.fuelType] ?? 'bg-surface-sunken text-ink-2'}`}>
              {codeLabel(tank.fuelType)}
            </span>
            {isInactive && <StatusBadge tone="warn" icon={PauseCircle} label={t('tanks.disabledFrozen')} />}
            {isEmpty && <StatusBadge tone="bad" icon={AlertTriangle} label={t('tanks.emptyStock')} />}
            {!isInactive && !isEmpty && isLow && <StatusBadge tone="bad" icon={AlertTriangle} label={t('tanks.lowStock')} />}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!isInactive && (
            <button type="button" aria-expanded={isEditing} onClick={() => onEditingChange(!isEditing)} className="ui-btn ui-btn-ghost ui-btn-compact">
              {isEditing ? t('common:actions.cancel') : t('common:actions.edit')}
            </button>
          )}
          {isInactive ? (
            <button type="button" onClick={() => changeStatus('ACTIVE')} disabled={statusMutation.isPending} className="ui-btn ui-btn-secondary ui-btn-compact">
              {t('common:actions.enable')}
            </button>
          ) : (
            <ConfirmButton
              triggerLabel={t('common:actions.disable')}
              triggerAriaLabel={t('tanks.disableAria', { name: tank.tankIdentifier })}
              prompt={stockShare > 0.05
                ? t('tanks.freezePrompt', { percent: formatNumberIn(stockShare * 100, { maximumFractionDigits: 0 }) })
                : t('tanks.disablePrompt')}
              onConfirm={() => changeStatus('INACTIVE')}
              disabled={statusMutation.isPending}
              triggerClassName="ui-btn ui-btn-ghost ui-btn-compact"
            />
          )}
        </div>
      </div>

      <TankGauge tankName={tank.tankIdentifier} fuelType={tank.fuelType} stock={Number(tank.currentStock)}
        capacity={Number(tank.capacity)} unit={unit} isLow={isLow && !isInactive} />

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <li className={`inline-flex items-center gap-1 ${mappedNozzleCount === 0 && !isInactive ? 'font-medium text-warn' : 'text-ink-2'}`}>
          <Fuel size={12} strokeWidth={2} aria-hidden="true" />
          {mappedNozzleCount === 0 ? t('tanks.noNozzles') : t('tanks.mappedNozzles', { count: mappedNozzleCount })}
        </li>
        {lastDipAt && (
          <li className="inline-flex items-center gap-1 text-ink-2">
            <Ruler size={12} strokeWidth={2} aria-hidden="true" />
            {t('tanks.lastDip', { date: formatIstDate(lastDipAt) })}
          </li>
        )}
      </ul>

      {statusError && <p role="alert" className="ui-alert ui-alert-danger text-xs">{statusError}</p>}

      {isEditing && !isInactive && (
        <EditTankForm pumpId={pumpId} tank={tank} unit={unit} onClose={() => onEditingChange(false)} />
      )}
    </article>
  )
}
