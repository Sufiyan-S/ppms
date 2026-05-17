import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Check, X, Sparkles, Circle } from 'lucide-react'
import { usePumpStore } from '../../store/usePumpStore'
import { userApi } from '../../api/userApi'
import { shiftPlanApi } from '../../api/shiftPlanApi'
import type { ShiftPlanEntry } from '../../api/shiftPlanApi'
import { shiftDefinitionApi } from '../../api/shiftDefinitionApi'
import { useAuthStore } from '../../store/authStore'
import { SearchableSelect } from '../../components/SearchableSelect'
import { SkeletonTable } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { formatIstDate } from '../../utils/date'
import { ModalPortal } from '../../components/ModalPortal'
import { parseApiError } from '../../utils/apiError'

// Cyclic color palette for shift rows — index into this by (sortOrder - 1)
const SHIFT_ROW_COLORS = [
  { bg: 'bg-indigo-50',  text: 'text-indigo-700' },
  { bg: 'bg-amber-50',   text: 'text-amber-700'  },
  { bg: 'bg-emerald-50', text: 'text-emerald-700'},
  { bg: 'bg-rose-50',    text: 'text-rose-700'   },
]

const STATUS_BADGE: Record<string, string> = {
  PLANNED:   'bg-slate-100 text-slate-600',
  CONFIRMED: 'bg-emerald-100 text-emerald-700',
  ABSENT:    'bg-red-100 text-red-600',
}

// Return Monday of the week containing `date`
function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// Use local date components — toISOString() converts to UTC first, causing off-by-one day errors in non-UTC timezones
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDay(iso: string): string {
  return formatIstDate(iso, { weekday: 'short', day: 'numeric', month: 'short' })
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ShiftPlanningPage() {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const queryClient = useQueryClient()

  const { selectedPumpId } = usePumpStore()
  const [weekStart, setWeekStart] = useState<string>(() => toISODate(getMonday(new Date())))

  // Generate modal state
  const [showGenerate, setShowGenerate] = useState(false)
  const [genDayOps, setGenDayOps] = useState('2')
  const [genNightOps, setGenNightOps] = useState('1')
  const [genError, setGenError] = useState<string | null>(null)

  // Slot editor state
  const [editSlot, setEditSlot] = useState<{ date: string; shiftDefinitionId: number } | null>(null)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [addOpId, setAddOpId] = useState<string>('')

  const pumpId = selectedPumpId

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', pumpId],
    queryFn: () => userApi.getStaff(pumpId!),
    enabled: !!pumpId,
  })
  const operatorStaff = staff.filter(s => s.role === 'OPERATOR' && s.status === 'ACTIVE')
  const staffById = Object.fromEntries(operatorStaff.map(s => [s.id, s]))

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['shiftPlan', pumpId, weekStart],
    queryFn: () => shiftPlanApi.getPlan(pumpId!, weekStart),
    enabled: !!pumpId,
    retry: false,
  })

  const { data: entries = [] } = useQuery({
    queryKey: ['shiftPlanEntries', plan?.id],
    queryFn: () => shiftPlanApi.getEntries(pumpId!, plan!.id),
    enabled: !!plan?.id,
  })

  // Last day of the displayed week (weekStart + 6 days)
  const weekEnd = (() => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + 6)
    return toISODate(d)
  })()

  const { data: actualAttendance = [] } = useQuery({
    queryKey: ['actualAttendance', pumpId, weekStart],
    queryFn: () => shiftPlanApi.getActualAttendance(pumpId!, weekStart, weekEnd),
    enabled: !!pumpId,
    refetchInterval: 60_000, // refresh every 60s so today's shifts reflect live status
  })

  const { data: shiftDefinitions = [] } = useQuery({
    queryKey: ['shift-definitions-active', pumpId],
    queryFn: () => shiftDefinitionApi.getActive(pumpId!),
    enabled: !!pumpId,
  })
  const sortedDefs = [...shiftDefinitions].sort((a, b) => a.sortOrder - b.sortOrder)

  const invalidatePlan = () => {
    queryClient.invalidateQueries({ queryKey: ['shiftPlan', pumpId, weekStart] })
    queryClient.invalidateQueries({ queryKey: ['shiftPlanEntries', plan?.id] })
  }

  const generateMutation = useMutation({
    mutationFn: () => shiftPlanApi.generatePlan(pumpId!, weekStart, Number(genDayOps), Number(genNightOps)),
    onSuccess: () => { setShowGenerate(false); setGenError(null); invalidatePlan() },
    onError: (err: any) => setGenError(parseApiError(err, 'Failed to generate plan')),
  })

  const publishMutation = useMutation({
    mutationFn: () => shiftPlanApi.publishPlan(pumpId!, plan!.id),
    onSuccess: () => invalidatePlan(),
  })

  const removeEntryMutation = useMutation({
    mutationFn: ({ entryId }: { entryId: number }) =>
      shiftPlanApi.removeEntry(pumpId!, plan!.id, entryId),
    onSuccess: () => { invalidatePlan(); setSlotError(null) },
    onError: (err: any) => setSlotError(parseApiError(err, 'Failed to remove')),
  })

  const addEntryMutation = useMutation({
    mutationFn: ({ opId }: { opId: number }) =>
      shiftPlanApi.addEntry(pumpId!, plan!.id, editSlot!.date, editSlot!.shiftDefinitionId, opId),
    onSuccess: () => { setAddOpId(''); setSlotError(null); invalidatePlan() },
    onError: (err: any) => setSlotError(parseApiError(err, 'Failed to add operator')),
  })

  // Navigation
  const prevWeek = () => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() - 7)
    setWeekStart(toISODate(d))
  }
  const nextWeek = () => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + 7)
    setWeekStart(toISODate(d))
  }

  // Build 7 day columns
  const days: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + i)
    return toISODate(d)
  })

  const today = toISODate(new Date())

  // The week is entirely in the past when its last day is before today
  const isWeekEntirelyPast = weekEnd < today

  // Build entry lookup: date → shiftDefinitionId → entries[]
  const entryMap: Record<string, Record<number, ShiftPlanEntry[]>> = {}
  for (const e of entries) {
    entryMap[e.shiftDate] ??= {}
    entryMap[e.shiftDate][e.shiftDefinitionId] ??= []
    entryMap[e.shiftDate][e.shiftDefinitionId].push(e)
  }

  // Build actual attendance lookup: date → shiftDefinitionId → distinct operatorUserIds[]
  const actualMap: Record<string, Record<number, number[]>> = {}
  for (const a of actualAttendance) {
    actualMap[a.shiftDate] ??= {}
    actualMap[a.shiftDate][a.shiftDefinitionId] ??= []
    if (!actualMap[a.shiftDate][a.shiftDefinitionId].includes(a.operatorUserId)) {
      actualMap[a.shiftDate][a.shiftDefinitionId].push(a.operatorUserId)
    }
  }

  const isEditingSlot = (date: string, shiftDefinitionId: number) =>
    editSlot?.date === date && editSlot?.shiftDefinitionId === shiftDefinitionId

  if (!isOwnerOrAdmin && !pumpId) {
    return (
      <div className="ui-page ui-page--narrow">
        <div className="ui-alert ui-alert-warning text-sm">
          You are not assigned to any pump. Ask the Owner or Admin to assign you.
        </div>
      </div>
    )
  }

  return (
    <div className="ui-page ui-page--narrow space-y-5">

      {/* Page title */}
      <Reveal delay={60}>
      <div>
        <h2 className="ui-title-sm">Shift Planning</h2>
        <p className="ui-subtitle">
          Plan weekly operator schedules. Published plans pre-fill shift opening.
        </p>
      </div>
      </Reveal>

      {pumpId && (
        <>
          {/* Week navigator + actions */}
          <Reveal delay={130}>
          <div className="ui-card flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button onClick={prevWeek}
                className="ui-btn ui-btn-secondary min-h-0 px-3 py-2 text-slate-500">
                <ChevronLeft size={14} strokeWidth={2} />
              </button>
              <span className="text-sm font-semibold text-slate-700">
                Week of {formatIstDate(weekStart, { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <button onClick={nextWeek}
                className="ui-btn ui-btn-secondary min-h-0 px-3 py-2 text-slate-500">
                <ChevronRight size={14} strokeWidth={2} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {plan && (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  plan.status === 'PUBLISHED'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {plan.status === 'PUBLISHED'
                    ? <span className="inline-flex items-center gap-1"><Check size={11} strokeWidth={2.5} />Published</span>
                    : <span className="inline-flex items-center gap-1"><Circle size={8} fill="currentColor" strokeWidth={0} />Draft</span>
                  }
                </span>
              )}
              {isOwnerOrAdmin && (
                <>
                  <button
                    onClick={() => { setShowGenerate(true); setGenError(null) }}
                    disabled={isWeekEntirelyPast}
                    title={isWeekEntirelyPast ? 'Cannot generate a plan for a past week' : undefined}
                    className="ui-btn ui-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {plan ? 'Regenerate' : <span className="inline-flex items-center gap-1.5"><Sparkles size={13} strokeWidth={2} />Auto-generate</span>}
                  </button>
                  {plan && plan.status === 'DRAFT' && (
                    <button
                      onClick={() => publishMutation.mutate()}
                      disabled={publishMutation.isPending}
                      className="ui-btn ui-btn-primary bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300"
                    >
                      {publishMutation.isPending ? 'Publishing…' : 'Publish Week'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          </Reveal>

          {/* Auto-generate modal */}
          {showGenerate && (
            <ModalPortal>
            <div className="ui-modal-backdrop">
              <div className="ui-modal-panel w-full max-w-sm">
                <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
                  <div className="ui-modal-heading">
                    <h3 className="ui-modal-title">Auto-generate Schedule</h3>
                    <p className="ui-modal-subtitle">
                      The system will assign operators based on preferences, leave dates, and fairness.
                    </p>
                  </div>
                  <button onClick={() => setShowGenerate(false)} className="ui-btn ui-btn-ghost ui-modal-close">×</button>
                </div>
                <div className="ui-modal-body space-y-3">
                  <div>
                    <label className="ui-label">
                      Operators per Morning / Evening shift
                    </label>
                    <input type="number" min="1" max="20" value={genDayOps}
                      onChange={e => setGenDayOps(e.target.value)}
                      className="w-24 text-sm"
                    />
                  </div>
                  <div>
                    <label className="ui-label">
                      Operators per Night shift (12 AM – 8 AM)
                    </label>
                    <input type="number" min="1" max="20" value={genNightOps}
                      onChange={e => setGenNightOps(e.target.value)}
                      className="w-24 text-sm"
                    />
                  </div>
                </div>
                <div className="ui-modal-body pt-0">
                  {genError && <p className="ui-error-text">{genError}</p>}
                </div>
                <div className="ui-modal-footer">
                  <button
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending}
                    className="ui-btn ui-btn-primary"
                  >
                    {generateMutation.isPending ? 'Generating…' : 'Generate'}
                  </button>
                  <button onClick={() => setShowGenerate(false)}
                    className="ui-btn ui-btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
            </ModalPortal>
          )}

          {/* Planning grid */}
          <Reveal delay={200}>
          {planLoading ? (
            <div className="ui-card px-5 py-4"><SkeletonTable rows={4} cols={7} /></div>
          ) : (
            <>
              {/* No-plan notice for future weeks */}
              {!plan && isOwnerOrAdmin && days.some(d => d >= today) && (
                <div className="ui-card-plain ui-card-muted px-5 py-3 text-sm text-slate-500 text-center">
                  No plan generated for this week yet.{' '}
                  <span className="text-blue-600 font-medium">Click "Auto-generate" to create a schedule.</span>
                </div>
              )}

              <div className="ui-card p-0 overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="w-28 text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Shift
                      </th>
                      {days.map(day => (
                        <th key={day} className={`px-2 py-3 text-center font-semibold ${day < today ? 'text-slate-400' : 'text-slate-600'}`}>
                          {formatDay(day)}
                          {day < today && (
                            <div className="text-xs font-normal text-slate-300 mt-0.5">actual</div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDefs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-400">
                          No shift definitions configured for this pump. Set them up in Pump Setup first.
                        </td>
                      </tr>
                    ) : sortedDefs.map((def, defIdx) => {
                      const colors = SHIFT_ROW_COLORS[defIdx % SHIFT_ROW_COLORS.length]
                      return (
                        <tr key={def.id} className={`border-b border-slate-100 ${colors.bg}`}>
                          <td className={`px-3 py-3 font-semibold ${colors.text} align-top`}>
                            {def.name}
                            {def.isNightShift && (
                              <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">Night</span>
                            )}
                            <div className="font-normal text-slate-400 text-xs mt-0.5 leading-tight">
                              {def.windowLabel}
                            </div>
                          </td>
                          {days.map(day => {
                            const slotEntries = entryMap[day]?.[def.id] ?? []
                            const actualOpIds = actualMap[day]?.[def.id] ?? []
                            // Show actual attendance for past days, or for today's slots where a shift has already started
                            const isPast = day < today || (day === today && actualOpIds.length > 0)
                            const isEditing = isEditingSlot(day, def.id)
                            const availableToAdd = operatorStaff.filter(
                              s => !slotEntries.some(e => e.operatorUserId === s.id)
                            )

                            return (
                              <td key={day} className={`px-2 py-2 align-top ${isPast ? 'opacity-80' : ''}`}>
                                <div className="space-y-1">
                                  {isPast ? (
                                    // Past date: show confirmed (actually worked) + absent (planned but didn't show)
                                    (() => {
                                      const absentEntries = slotEntries.filter(
                                        e => !actualOpIds.includes(e.operatorUserId)
                                      )
                                      if (actualOpIds.length === 0 && absentEntries.length === 0) {
                                        return <span className="text-slate-300 text-xs italic">No shift</span>
                                      }
                                      return (
                                        <>
                                          {actualOpIds.map(opId => (
                                            <div key={opId} className="flex items-center gap-1">
                                              <span className="truncate text-slate-600 font-medium">
                                                {staffById[opId]?.fullName ?? `#${opId}`}
                                              </span>
                                              <span className="ml-auto flex items-center px-1.5 py-0.5 rounded-full shrink-0 bg-emerald-100 text-emerald-700">
                                                <Check size={10} strokeWidth={2.5} />
                                              </span>
                                            </div>
                                          ))}
                                          {absentEntries.map(entry => (
                                            <div key={`absent-${entry.id}`} className="flex items-center gap-1">
                                              <span className="truncate text-slate-400 font-medium">
                                                {staffById[entry.operatorUserId]?.fullName ?? `#${entry.operatorUserId}`}
                                              </span>
                                              <span className="ml-auto flex items-center px-1.5 py-0.5 rounded-full shrink-0 bg-red-100 text-red-600">
                                                <X size={10} strokeWidth={2.5} />
                                              </span>
                                            </div>
                                          ))}
                                        </>
                                      )
                                    })()
                                  ) : (
                                    // Future / today: show plan entries
                                    <>
                                      {slotEntries.map(entry => (
                                        <div key={entry.id} className="flex items-center gap-1 group">
                                          <span className="truncate text-slate-700 font-medium">
                                            {staffById[entry.operatorUserId]?.fullName ?? `#${entry.operatorUserId}`}
                                          </span>
                                          <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[entry.status]}`}>
                                            {entry.status === 'PLANNED' ? <Circle size={8} fill="currentColor" strokeWidth={0} /> : entry.status === 'CONFIRMED' ? <Check size={10} strokeWidth={2.5} /> : <X size={10} strokeWidth={2.5} />}
                                          </span>
                                          {isOwnerOrAdmin && entry.status === 'PLANNED' && (
                                            <button
                                              type="button"
                                              onClick={() => removeEntryMutation.mutate({ entryId: entry.id })}
                                              disabled={removeEntryMutation.isPending}
                                              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all ml-0.5 shrink-0 p-0.5"
                                              title="Remove"
                                            >
                                              <X size={11} strokeWidth={2} />
                                            </button>
                                          )}
                                        </div>
                                      ))}

                                      {/* Add operator to slot */}
                                      {isOwnerOrAdmin && plan && !isEditing && (
                                        <button
                                          type="button"
                                          onClick={() => { setEditSlot({ date: day, shiftDefinitionId: def.id }); setSlotError(null); setAddOpId('') }}
                                          className="text-slate-300 hover:text-blue-500 transition-colors text-xs"
                                          title="Add operator"
                                        >
                                          + Add
                                        </button>
                                      )}

                                      {isEditing && (
                                        <div className="mt-1 space-y-1">
                                          <SearchableSelect
                                            value={addOpId}
                                            onChange={v => setAddOpId(v)}
                                            placeholder="— pick operator —"
                                            size="sm"
                                            options={availableToAdd.map(s => ({ value: s.id.toString(), label: s.fullName }))}
                                          />
                                          <div className="flex gap-1">
                                            <button
                                              type="button"
                                              onClick={() => addOpId && addEntryMutation.mutate({ opId: Number(addOpId) })}
                                              disabled={!addOpId || addEntryMutation.isPending}
                                              className="ui-btn ui-btn-primary min-h-0 px-2 py-1 text-xs disabled:bg-blue-300"
                                            >
                                              Add
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => { setEditSlot(null); setSlotError(null) }}
                                              className="ui-btn ui-btn-secondary min-h-0 px-2 py-1 text-xs"
                                            >
                                              <X size={12} strokeWidth={2} />
                                            </button>
                                          </div>
                                          {slotError && <p className="ui-error-text">{slotError}</p>}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          </Reveal>

          {/* Legend */}
          <Reveal delay={270}>
          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" /> Planned
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Confirmed (showed up)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Absent (didn't show)
            </span>
          </div>
          </Reveal>
        </>
      )}
    </div>
  )
}
