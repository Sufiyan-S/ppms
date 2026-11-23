import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../utils/apiError'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary, TankInfo, UpdateTankRequest } from '../../api/pumpApi'
import type { FuelType } from '../../types/shift'
import { FUEL_UNIT } from '../../constants/fuel'
import { codeLabel } from '../../constants/labels'
import { formatNumberIn } from '../../i18n/format'
import { ALL_FUEL_TYPES, FUEL_COLOR } from './fuelStyles'
import { ConfirmButton } from '../../components/ConfirmButton'
import { StatusBadge } from '../../components/StatusBadge'
import { FormField } from '../../components/FormField'
import { FormGrid } from '../../components/layout/FormGrid'
import { LoadingButton } from '../../components/LoadingButton'
import { NumericInput } from '../../components/NumericInput'
import { SearchableSelect } from '../../components/SearchableSelect'
import { StillNeeded } from '../../components/StillNeeded'

const formatQuantity = (value: number, unit: string) =>
  `${formatNumberIn(value, { maximumFractionDigits: 2 })} ${unit}`

/** The typed amount as a readable quantity, or nothing until a positive number is typed. */
function typedQuantity(value: string, unit: string): string | null {
  const amount = Number(value)
  return value.trim() !== '' && Number.isFinite(amount) && amount > 0 ? formatQuantity(amount, unit) : null
}

// ── Tanks content ─────────────────────────────────────────────────────────────
// Owner manually creates each underground tank (name, fuel type, capacity).
// Multiple tanks per fuel type are supported (e.g. 3 petrol tanks).

export function TanksContent({ pump }: { pump: PumpSummary }) {
  const { t } = useTranslation(['setup', 'common'])
  const queryClient = useQueryClient()
  const stillNeededId = useId()

  // Create form state
  const [createIdentifier, setCreateIdentifier] = useState('')
  const [createFuelType, setCreateFuelType]     = useState<FuelType>('PETROL')
  const [createCapacity, setCreateCapacity]     = useState('')
  const [createDipTol, setCreateDipTol]         = useState('')
  const [createError, setCreateError]           = useState<string | null>(null)

  // Edit form state
  const [editingId, setEditingId]         = useState<number | null>(null)
  const [editCapacity, setEditCapacity]   = useState('')
  const [editIdentifier, setEditIdentifier] = useState('')
  const [editError, setEditError]         = useState<string | null>(null)

  const [statusError, setStatusError]           = useState<string | null>(null)

  const { data: tanks = [], isLoading } = useQuery({
    queryKey: ['tanks', pump.id],
    queryFn:  () => pumpApi.getTanks(pump.id),
  })

  const createMutation = useMutation({
    mutationFn: (req: { tankIdentifier: string; fuelType: FuelType; capacity: number; dipTolerance?: number }) =>
      pumpApi.createTank(pump.id, req),
    onSuccess: () => {
      setCreateIdentifier(''); setCreateCapacity(''); setCreateDipTol(''); setCreateError(null)
      queryClient.invalidateQueries({ queryKey: ['tanks', pump.id] })
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pump.id] })
    },
    onError: (err) => setCreateError(parseApiError(err, t('tanks.createFailed'))),
  })

  const updateMutation = useMutation({
    mutationFn: ({ tankId, req }: { tankId: number; req: UpdateTankRequest }) => pumpApi.updateTank(pump.id, tankId, req),
    onSuccess: () => {
      setEditingId(null); setEditError(null)
      queryClient.invalidateQueries({ queryKey: ['tanks', pump.id] })
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pump.id] })
    },
    onError: (err) => setEditError(parseApiError(err, t('tanks.updateFailed'))),
  })

  const statusMutation = useMutation({
    mutationFn: ({ tankId, status }: { tankId: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      pumpApi.updateTankStatus(pump.id, tankId, status),
    onSuccess: () => {
      setStatusError(null)
      queryClient.invalidateQueries({ queryKey: ['tanks', pump.id] })
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pump.id] })
    },
    onError: (err) => setStatusError(parseApiError(err, t('tanks.statusFailed'))),
  })

  /** Returns true when currentStock > 5% of capacity (significant frozen stock warning). */
  const hasSignificantStock = (tank: TankInfo) =>
    tank.capacity > 0 && (tank.currentStock / tank.capacity) > 0.05

  const createUnit = FUEL_UNIT[createFuelType] ?? 'L'
  const createCapacityText = typedQuantity(createCapacity, createUnit)
  const createDipTolText = typedQuantity(createDipTol, createUnit)
  const stillNeeded = [
    ...(createIdentifier.trim() === '' ? [t('tanks.nameLabel')] : []),
    ...(createCapacityText === null ? [t('tanks.capacity')] : []),
  ]

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault(); setCreateError(null)
    if (!createIdentifier.trim()) { setCreateError(t('tanks.nameRequired')); return }
    if (!createCapacity || Number(createCapacity) <= 0) { setCreateError(t('tanks.capacityPositive')); return }
    createMutation.mutate({
      tankIdentifier: createIdentifier.trim(),
      fuelType: createFuelType,
      capacity: Number(createCapacity),
      dipTolerance: createDipTol ? Number(createDipTol) : undefined,
    })
  }

  const submitEdit = (e: React.FormEvent, tank: TankInfo) => {
    e.preventDefault(); setEditError(null)
    if (!editCapacity || Number(editCapacity) <= 0) { setEditError(t('tanks.capacityPositive')); return }
    updateMutation.mutate({
      tankId: tank.id,
      req: { capacity: Number(editCapacity), tankIdentifier: editIdentifier.trim() || undefined },
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-3">
        {t('tanks.intro')}
      </p>

      {/* Existing tanks */}
      {isLoading ? (
        <p className="text-xs text-ink-3">{t('tanks.loading')}</p>
      ) : tanks.length === 0 ? (
        <p className="text-xs text-ink-3">{t('tanks.empty')}</p>
      ) : (
        <div className="space-y-2">
          {statusError && (
            <p role="alert" className="ui-alert ui-alert-danger text-xs">{statusError}</p>
          )}
          {(tanks as TankInfo[]).map((tank) => {
            const isInactive = tank.status === 'INACTIVE'
            const unit = FUEL_UNIT[tank.fuelType] ?? 'L'
            return (
              <div key={tank.id} className={`border rounded-control overflow-hidden transition-opacity ${
                isInactive ? 'border-border bg-bg opacity-70' : 'border-border bg-surface'
              }`}>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-badge border ${
                      isInactive ? 'bg-surface-sunken text-ink-3 border-border' : (FUEL_COLOR[tank.fuelType] ?? 'bg-surface-sunken text-ink-2 border-border')
                    }`}>
                      {codeLabel(tank.fuelType)}
                    </span>
                    <span className={`text-sm font-semibold ${isInactive ? 'text-ink-3' : 'text-ink'}`}>
                      {tank.tankIdentifier}
                    </span>
                    {isInactive && (
                      <StatusBadge tone="warn" label={t('tanks.disabled')} />
                    )}
                    <span className="text-xs text-ink-3">
                      {t('tanks.capacityPrefix')} <span className="text-ink-3 font-medium">
                        {formatNumberIn(Number(tank.capacity), { minimumFractionDigits: 0 })} {unit}
                      </span>
                      {isInactive && (
                        <span className="ml-1 text-warn">{t('tanks.stockFrozen')}</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {/* Edit is only available for active tanks */}
                    {!isInactive && (
                        <button type="button"
                          aria-expanded={editingId === tank.id}
                          onClick={() => {
                            if (editingId === tank.id) { setEditingId(null) } else {
                              setEditingId(tank.id); setEditCapacity(String(tank.capacity))
                              setEditIdentifier(tank.tankIdentifier); setEditError(null)
                            }
                          }}
                          className="ui-btn ui-btn-ghost ui-btn-compact">
                          {editingId === tank.id ? t('common:actions.cancel') : t('common:actions.edit')}
                        </button>
                    )}

                    {/* Disable / Enable toggle */}
                    {isInactive ? (
                      <button
                        type="button"
                        onClick={() => { setStatusError(null); statusMutation.mutate({ tankId: tank.id, status: 'ACTIVE' }) }}
                        disabled={statusMutation.isPending}
                        className="ui-btn ui-btn-secondary ui-btn-compact">
                        {t('common:actions.enable')}
                      </button>
                    ) : (
                      <ConfirmButton
                        triggerLabel={t('common:actions.disable')}
                        triggerAriaLabel={t('tanks.disableAria', { name: tank.tankIdentifier })}
                        prompt={hasSignificantStock(tank)
                          ? t('tanks.freezePrompt', { percent: ((tank.currentStock / tank.capacity) * 100).toFixed(0) })
                          : t('tanks.disablePrompt')}
                        onConfirm={() => { setStatusError(null); statusMutation.mutate({ tankId: tank.id, status: 'INACTIVE' }) }}
                        disabled={statusMutation.isPending}
                        triggerClassName="ui-btn ui-btn-ghost ui-btn-compact"
                        confirmClassName="ui-btn ui-btn-danger ui-btn-compact"
                      />
                    )}
                  </div>
                </div>

                {editingId === tank.id && !isInactive && (
                  <form onSubmit={(e) => submitEdit(e, tank)}
                    className="px-3 py-3 border-t border-border bg-bg space-y-3">
                    <FormGrid>
                      <FormField label={t('tanks.nameLabel')}>
                        <input type="text" value={editIdentifier}
                          onChange={(e) => setEditIdentifier(e.target.value)}
                          className="text-sm" />
                      </FormField>
                      <FormField label={t('tanks.capacity')} help={typedQuantity(editCapacity, unit) ?? undefined}
                        error={editError ?? undefined}>
                        <NumericInput step="0.01" min="1" unit={unit} value={editCapacity}
                          onChange={(e) => setEditCapacity(e.target.value)} />
                      </FormField>
                    </FormGrid>
                    <div className="flex gap-2">
                      <LoadingButton type="submit" isLoading={updateMutation.isPending} loadingLabel={t('common:actions.saving')}
                        className="ui-btn-primary">
                        {t('tanks.saveTank')}
                      </LoadingButton>
                      <button type="button" onClick={() => setEditingId(null)} className="ui-btn ui-btn-secondary">
                        {t('common:actions.cancel')}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add tank form */}
      <section aria-labelledby={`${stillNeededId}-title`} className={tanks.length > 0 ? 'border-t border-border pt-4' : ''}>
        <h3 id={`${stillNeededId}-title`} className="text-sm font-semibold text-ink mb-3">
          {tanks.length === 0 ? t('tanks.addFirst') : t('tanks.addAnother')}
        </h3>
        <form onSubmit={submitCreate} className="space-y-3">
          <FormGrid>
            <FormField label={t('tanks.nameLabel')}>
              <input required type="text" value={createIdentifier}
                onChange={(e) => setCreateIdentifier(e.target.value)}
                placeholder={t('tanks.namePlaceholder')}
                className="text-sm" />
            </FormField>
            <div>
              <span id={`${stillNeededId}-fuel`} className="ui-label">{t('tanks.fuelType')}</span>
              <SearchableSelect aria-labelledby={`${stillNeededId}-fuel`}
                value={createFuelType}
                onChange={(v) => setCreateFuelType(v as FuelType)}
                options={ALL_FUEL_TYPES.map((ft) => ({ value: ft, label: codeLabel(ft) }))}
              />
            </div>
            <FormField label={t('tanks.capacity')}
              help={createCapacityText ? t('tanks.capacityHelp', { amount: createCapacityText }) : undefined}>
              <NumericInput required step="0.01" min="1" unit={createUnit} value={createCapacity}
                onChange={(e) => setCreateCapacity(e.target.value)} />
            </FormField>
            <FormField
              label={<>{t('tanks.dipTolerance')} <span className="text-ink-3 font-normal">{t('common:fields.optionalSuffix')}</span></>}
              help={createDipTolText ? t('tanks.dipToleranceHelp', { amount: createDipTolText }) : t('tanks.dipToleranceHint')}>
              <NumericInput step="0.01" min="0" unit={createUnit} value={createDipTol}
                onChange={(e) => setCreateDipTol(e.target.value)} />
            </FormField>
          </FormGrid>
          {createError && <p role="alert" className="ui-error-text">{createError}</p>}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <StillNeeded id={stillNeededId} items={stillNeeded} />
            <LoadingButton type="submit" isLoading={createMutation.isPending} loadingLabel={t('actions.adding')}
              disabled={stillNeeded.length > 0}
              aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
              className="ui-btn-primary">
              {t('tanks.add')}
            </LoadingButton>
          </div>
        </form>
      </section>
    </div>
  )
}
