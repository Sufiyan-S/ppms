import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Fuel, X, Plus } from 'lucide-react'
import { superAdminApi } from '../../api/superAdminApi'
import type { OwnerSummary, PumpSummary, UpdatePumpRequest } from '../../api/superAdminApi'
import { Pagination } from '../../components/Pagination'
import { SkeletonRows } from '../../components/Skeleton'
import { formatIstDate } from '../../utils/date'
import { parseApiError } from '../../utils/apiError'
import { AddPumpForm } from './AddPumpForm'
import { PumpCard } from './PumpCard'

const ownersPageSize = 10

interface OwnersListProps {
  owners: OwnerSummary[]
  ownersLoading: boolean
}

export function OwnersList({ owners, ownersLoading }: OwnersListProps) {
  const queryClient = useQueryClient()

  // Which owner's "Add Pump" form is currently open (null = none)
  const [addPumpOwnerId, setAddPumpOwnerId] = useState<number | null>(null)

  // Which pump's "Edit" form is currently open (null = none)
  const [editingPumpId, setEditingPumpId] = useState<number | null>(null)
  const [editPumpError, setEditPumpError] = useState<string | null>(null)

  // Owners list pagination
  const [ownersPage, setOwnersPage] = useState(0)

  const editPumpMutation = useMutation({
    mutationFn: ({ pumpId, data }: { pumpId: number; data: UpdatePumpRequest }) =>
      superAdminApi.updatePump(pumpId, data),
    onSuccess: () => {
      setEditingPumpId(null)
      setEditPumpError(null)
      queryClient.invalidateQueries({ queryKey: ['superadmin-owners'] })
    },
    onError: (err) =>
      setEditPumpError(parseApiError(err, 'Failed to update pump. Please try again.')),
  })

  function toggleAddPump(ownerId: number) {
    setAddPumpOwnerId(addPumpOwnerId === ownerId ? null : ownerId)
  }

  function toggleEditPump(pump: PumpSummary) {
    setEditingPumpId(editingPumpId === pump.pumpId ? null : pump.pumpId)
    setEditPumpError(null)
  }

  function togglePumpEnabled(pump: PumpSummary) {
    editPumpMutation.mutate({
      pumpId: pump.pumpId,
      data: { pumpName: pump.pumpName, pumpAddress: pump.pumpAddress, enabled: !pump.enabled },
    })
  }

  return (
    <div className="lg:col-span-3">
      <div className="ui-card p-0">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Onboarded Owners</h2>
            <p className="text-xs text-slate-500 mt-0.5">All pump owners currently on the platform.</p>
          </div>
          <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full">
            {owners.length} owner{owners.length !== 1 ? 's' : ''}
          </span>
        </div>

        {ownersLoading ? (
          <div className="px-5 py-4"><SkeletonRows count={5} /></div>
        ) : owners.length === 0 ? (
          <div className="ui-empty px-5 py-8">
            <p className="ui-subtitle">No owners yet.</p>
            <p className="text-xs text-slate-500 mt-1">Use the form to onboard your first pump owner.</p>
          </div>
        ) : (() => {
          const totalPages = Math.max(1, Math.ceil(owners.length / ownersPageSize))
          const safePage   = Math.min(ownersPage, totalPages - 1)
          const pageOwners = owners.slice(safePage * ownersPageSize, (safePage + 1) * ownersPageSize)
          const pagedData  = {
            content: pageOwners, page: safePage, pageSize: ownersPageSize,
            totalElements: owners.length, totalPages,
            hasNext: safePage < totalPages - 1, hasPrevious: safePage > 0,
          }
          return (
            <>
              <div className="divide-y divide-slate-100">
                {pageOwners.map((owner) => {
                  const isPumpFormOpen = addPumpOwnerId === owner.ownerId
                  const enabledPumps   = owner.pumps.filter(p => p.enabled).length
                  return (
                    <div key={owner.ownerId}>
                      <div className="px-5 py-4">
                        {/* Owner header row */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold text-indigo-600">
                                {owner.fullName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-slate-800">{owner.fullName}</p>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                  owner.status === 'ACTIVE'
                                    ? 'bg-green-50 text-green-700 border border-green-200'
                                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                                }`}>
                                  {owner.status.toLowerCase()}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 font-mono mt-0.5">{owner.phoneNumber}</p>
                              {/* Pump count summary */}
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                                  <Fuel size={11} strokeWidth={2} />{owner.pumps.length} pump{owner.pumps.length !== 1 ? 's' : ''}
                                  {owner.pumps.length > enabledPumps && (
                                    <span className="text-red-400">· {owner.pumps.length - enabledPumps} disabled</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => toggleAddPump(owner.ownerId)}
              className={`ui-btn min-h-0 px-3 py-1 text-xs border transition-colors ${
                isPumpFormOpen
                  ? 'border-indigo-400 text-indigo-700 bg-indigo-50'
                  : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50'
              }`}
            >
                              {isPumpFormOpen ? <span className="inline-flex items-center gap-1"><X size={12} strokeWidth={2} />Cancel</span> : <span className="inline-flex items-center gap-1"><Plus size={12} strokeWidth={2.5} />Add Pump</span>}
                            </button>
                          </div>
                        </div>

                        {/* Pumps list */}
                        {owner.pumps.length > 0 && (
                          <div className="mt-3 ml-12 space-y-2">
                            {owner.pumps.map((pump) => {
                              const isEditOpen = editingPumpId === pump.pumpId
                              return (
                                <PumpCard
                                  key={pump.pumpId}
                                  pump={pump}
                                  isEditOpen={isEditOpen}
                                  onToggleEdit={() => toggleEditPump(pump)}
                                  onToggleEnabled={() => togglePumpEnabled(pump)}
                                  isSaving={editPumpMutation.isPending}
                                  editError={editPumpError}
                                  onSaveEdit={(data) => {
                                    setEditPumpError(null)
                                    editPumpMutation.mutate({ pumpId: pump.pumpId, data })
                                  }}
                                />
                              )
                            })}
                          </div>
                        )}

                        {owner.pumps.length === 0 && (
                          <p className="ml-12 mt-2 ui-help italic">No pumps added yet.</p>
                        )}

                        <div className="mt-2 ml-12 flex items-center gap-3 ui-help">
                          <span>ID: <span className="font-mono text-slate-500">{owner.employeeId}</span></span>
                          <span>·</span>
                          <span>Joined {formatIstDate(owner.createdAt)}</span>
                        </div>
                      </div>

                      {/* Inline Add Pump form */}
                      {isPumpFormOpen && (
                        <AddPumpForm owner={owner} onDone={() => setAddPumpOwnerId(null)} />
                      )}
                    </div>
                  )
                })}
              </div>
              {owners.length > ownersPageSize && (
                <div className="px-5 border-t border-slate-100">
                  <Pagination
                    data={pagedData}
                    onPageChange={setOwnersPage}
                    onPageSizeChange={() => {}}
                    pageSizeOptions={[10]}
                  />
                </div>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}
