import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { parseApiError } from '../../utils/apiError'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary, TankInfo, UpdateTankRequest } from '../../api/pumpApi'
import type { FuelType } from '../../types/shift'
import { FUEL_LABELS, FUEL_UNIT } from '../../constants/fuel'
import { ALL_FUEL_TYPES, FUEL_COLOR } from './fuelStyles'
import { ConfirmButton } from '../../components/ConfirmButton'

// ── Tanks content ─────────────────────────────────────────────────────────────
// Owner manually creates each underground tank (name, fuel type, capacity).
// Multiple tanks per fuel type are supported (e.g. 3 petrol tanks).

export function TanksContent({ pump }: { pump: PumpSummary }) {
  const queryClient = useQueryClient()

  // Create form state
  const [createIdentifier, setCreateIdentifier] = useState('')
  const [createFuelType, setCreateFuelType]     = useState<FuelType>('PETROL')
  const [createCapacity, setCreateCapacity]     = useState('')
  const [createDipTol, setCreateDipTol]         = useState('')
  const [createError, setCreateError]           = useState<string | null>(null)

  // Fuel type dropdown open/close
  const [fuelDropdownOpen, setFuelDropdownOpen] = useState(false)
  const fuelDropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (fuelDropdownRef.current && !fuelDropdownRef.current.contains(e.target as Node)) {
        setFuelDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Edit form state
  const [editingId, setEditingId]         = useState<number | null>(null)
  const [editCapacity, setEditCapacity]   = useState('')
  const [editIdentifier, setEditIdentifier] = useState('')
  const [editError, setEditError]         = useState<string | null>(null)

  // Disable confirmation: null = no confirm shown; tankId = confirm dialog for that tank
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
    onError: (err) => setCreateError(parseApiError(err, 'Failed to create tank')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ tankId, req }: { tankId: number; req: UpdateTankRequest }) => pumpApi.updateTank(pump.id, tankId, req),
    onSuccess: () => {
      setEditingId(null); setEditError(null)
      queryClient.invalidateQueries({ queryKey: ['tanks', pump.id] })
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pump.id] })
    },
    onError: (err) => setEditError(parseApiError(err, 'Failed to update tank')),
  })

  const statusMutation = useMutation({
    mutationFn: ({ tankId, status }: { tankId: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      pumpApi.updateTankStatus(pump.id, tankId, status),
    onSuccess: () => {
      setStatusError(null)
      queryClient.invalidateQueries({ queryKey: ['tanks', pump.id] })
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pump.id] })
    },
    onError: (err) => setStatusError(parseApiError(err, 'Failed to update tank status')),
  })

  /** Returns true when currentStock > 5% of capacity (significant frozen stock warning). */
  const hasSignificantStock = (tank: TankInfo) =>
    tank.capacity > 0 && (tank.currentStock / tank.capacity) > 0.05

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault(); setCreateError(null)
    if (!createIdentifier.trim()) { setCreateError('Tank name is required.'); return }
    if (!createCapacity || Number(createCapacity) <= 0) { setCreateError('Capacity must be greater than 0.'); return }
    createMutation.mutate({
      tankIdentifier: createIdentifier.trim(),
      fuelType: createFuelType,
      capacity: Number(createCapacity),
      dipTolerance: createDipTol ? Number(createDipTol) : undefined,
    })
  }

  const submitEdit = (e: React.FormEvent, tank: TankInfo) => {
    e.preventDefault(); setEditError(null)
    if (!editCapacity || Number(editCapacity) <= 0) { setEditError('Capacity must be greater than 0.'); return }
    updateMutation.mutate({
      tankId: tank.id,
      req: { capacity: Number(editCapacity), tankIdentifier: editIdentifier.trim() || undefined },
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Add each underground tank manually. Multiple tanks per fuel type are allowed.
        Set capacity so that stock level bars and low-stock alerts work correctly.
      </p>

      {/* Existing tanks */}
      {isLoading ? (
        <p className="text-xs text-slate-500">Loading tanks...</p>
      ) : tanks.length === 0 ? (
        <p className="text-xs text-slate-500">No tanks yet. Add one below.</p>
      ) : (
        <div className="space-y-2">
          {statusError && (
            <div role="alert" className="ui-alert ui-alert-danger text-sm">
              <p className="text-red-600 text-xs">{statusError}</p>
            </div>
          )}
          {(tanks as TankInfo[]).map((tank) => {
            const isInactive = tank.status === 'INACTIVE'
            return (
              <div key={tank.id} className={`border rounded-lg overflow-hidden transition-opacity ${
                isInactive ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'
              }`}>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                      isInactive ? 'bg-slate-100 text-slate-500 border-slate-200' : (FUEL_COLOR[tank.fuelType] ?? 'bg-slate-100 text-slate-600 border-slate-200')
                    }`}>
                      {FUEL_LABELS[tank.fuelType] ?? tank.fuelType}
                    </span>
                    <span className={`text-sm font-semibold ${isInactive ? 'text-slate-500' : 'text-slate-700'}`}>
                      {tank.tankIdentifier}
                    </span>
                    {isInactive && (
                      <span className="text-xs bg-orange-100 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                        Disabled
                      </span>
                    )}
                    <span className="text-xs text-slate-500">
                      Capacity: <span className="text-slate-500 font-medium">
                        {Number(tank.capacity).toLocaleString('en-IN', { minimumFractionDigits: 0 })} {FUEL_UNIT[tank.fuelType] ?? 'L'}
                      </span>
                      {isInactive && (
                        <span className="ml-1 text-orange-500">(stock frozen)</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {/* Edit is only available for active tanks */}
                    {!isInactive && (
                        <button type="button"
                          onClick={() => {
                            if (editingId === tank.id) { setEditingId(null) } else {
                              setEditingId(tank.id); setEditCapacity(String(tank.capacity))
                              setEditIdentifier(tank.tankIdentifier); setEditError(null)
                            }
                          }}
                          className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800">
                          {editingId === tank.id ? 'Cancel' : 'Edit'}
                        </button>
                    )}

                    {/* Disable / Enable toggle */}
                    {isInactive ? (
                      <button
                        type="button"
                        onClick={() => { setStatusError(null); statusMutation.mutate({ tankId: tank.id, status: 'ACTIVE' }) }}
                        disabled={statusMutation.isPending}
                        className="min-h-6 text-xs font-medium text-emerald-700 transition-colors hover:text-emerald-800 disabled:opacity-50">
                        Enable
                      </button>
                    ) : (
                      <ConfirmButton
                        triggerLabel="Disable"
                        triggerAriaLabel={`Disable tank ${tank.tankIdentifier}`}
                        prompt={hasSignificantStock(tank)
                          ? `${((tank.currentStock / tank.capacity) * 100).toFixed(0)}% stock will be frozen. Confirm?`
                          : 'Disable this tank?'}
                        onConfirm={() => { setStatusError(null); statusMutation.mutate({ tankId: tank.id, status: 'INACTIVE' }) }}
                        disabled={statusMutation.isPending}
                        triggerClassName="min-h-6 text-xs font-medium text-orange-700 transition-colors hover:text-orange-800 disabled:opacity-50"
                        confirmClassName="ui-btn min-h-6 px-2 py-1 text-xs bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white"
                      />
                    )}
                  </div>
                </div>

                {editingId === tank.id && !isInactive && (
                  <form onSubmit={(e) => submitEdit(e, tank)}
                    className="px-3 py-3 border-t border-slate-100 bg-slate-50 space-y-2">
                    <div className="flex gap-3 items-end flex-wrap">
                      <div>
                        <label className="block">
                          <span className="ui-label">
                          Capacity ({FUEL_UNIT[tank.fuelType] ?? 'L'})
                        </span>
                          <input type="number" step="0.01" min="1" value={editCapacity}
                            onChange={(e) => setEditCapacity(e.target.value)}
                            className="w-36 text-xs min-h-10"
                            placeholder="e.g. 25000" />
                        </label>
                      </div>
                      <div>
                        <label className="block">
                          <span className="ui-label">Tank Name/ID</span>
                          <input type="text" value={editIdentifier}
                            onChange={(e) => setEditIdentifier(e.target.value)}
                            className="w-36 text-xs min-h-10"
                            placeholder="e.g. Petrol Tank 1" />
                        </label>
                      </div>
                      <button type="submit" disabled={updateMutation.isPending}
                        className="ui-btn ui-btn-primary min-h-0 px-3 py-1.5 text-xs">
                        {updateMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    {editError && <p role="alert" className="ui-error-text">{editError}</p>}
                  </form>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add tank form */}
      <div className={tanks.length > 0 ? 'border-t border-slate-200 pt-4' : ''}>
        <p className="ui-label mb-3">
          {tanks.length === 0 ? 'Add the first tank' : 'Add another tank'}
        </p>
        <form onSubmit={submitCreate} className="space-y-3">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="block">
                <span className="ui-label">Tank Name/ID <span className="text-red-500">*</span></span>
                <input required type="text" value={createIdentifier}
                  onChange={(e) => setCreateIdentifier(e.target.value)}
                  placeholder="e.g. Petrol Tank 1"
                  className="w-36 text-sm" />
              </label>
            </div>
            <div className="relative" ref={fuelDropdownRef}>
              <span className="ui-label">Fuel Type <span className="text-red-500">*</span></span>
              <button
                type="button"
                onClick={() => setFuelDropdownOpen(o => !o)}
                className="ui-btn ui-btn-secondary min-w-[148px] justify-between bg-white text-sm"
              >
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${FUEL_COLOR[createFuelType]}`}>
                  {FUEL_LABELS[createFuelType]}
                </span>
                <svg className={`w-4 h-4 text-slate-500 transition-transform duration-150 ${fuelDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {fuelDropdownOpen && (
                <div className="absolute z-20 mt-1 ui-card p-1 min-w-[160px]">
                  {ALL_FUEL_TYPES.map((ft) => (
                    <button
                      key={ft}
                      type="button"
                      onClick={() => { setCreateFuelType(ft); setFuelDropdownOpen(false) }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${createFuelType === ft ? 'bg-slate-50' : ''}`}
                    >
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${FUEL_COLOR[ft]}`}>
                        {FUEL_LABELS[ft]}
                      </span>
                      {createFuelType === ft && (
                        <svg className="ml-auto w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block">
                <span className="ui-label">
                Capacity ({FUEL_UNIT[createFuelType]}) <span className="text-red-500">*</span>
              </span>
                <input required type="number" step="0.01" min="1" value={createCapacity}
                  onChange={(e) => setCreateCapacity(e.target.value)}
                  placeholder="e.g. 25000"
                  className="w-32 text-sm" />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="ui-label">
                DIP Tolerance ({FUEL_UNIT[createFuelType]}) <span className="text-slate-500">(optional)</span>
              </span>
                <input type="number" step="0.01" min="0" value={createDipTol}
                  onChange={(e) => setCreateDipTol(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-28 text-sm" />
              </label>
            </div>
            <button type="submit" disabled={createMutation.isPending}
              className="ui-btn ui-btn-primary">
              {createMutation.isPending ? 'Adding...' : 'Add Tank'}
            </button>
          </div>
          {createError && <p role="alert" className="ui-error-text">{createError}</p>}
        </form>
      </div>
    </div>
  )
}

// ── Shift Definitions Content ─────────────────────────────────────────────────

/**
 * Subtracts 1 minute from a "HH:MM" time string.
 * End times are stored as exclusive upper bounds: user sees "09:00", backend stores "08:59".
 * This ensures consecutive shifts (one ending at 09:00, next starting at 09:00) don't overlap.
 */
