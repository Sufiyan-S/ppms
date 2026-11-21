import { Reveal } from '../../components/Reveal'
import { useShiftPlanning } from './planning/useShiftPlanning'
import { WeekNavigator } from './planning/WeekNavigator'
import { GeneratePlanModal } from './planning/GeneratePlanModal'
import { PlanningGrid } from './planning/PlanningGrid'

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ShiftPlanningPage() {
  const form = useShiftPlanning()
  const { isOwnerOrAdmin, pumpId } = form

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
        <h1 className="ui-title-sm">Shift Planning</h1>
        <p className="ui-subtitle">
          {isOwnerOrAdmin
            ? 'Plan weekly operator schedules. Published plans pre-fill shift opening.'
            : 'See who is scheduled for each shift this week.'}
        </p>
      </div>
      </Reveal>

      {pumpId && (
        <>
          {/* Week navigator + actions */}
          <WeekNavigator form={form} />


          {/* Auto-generate modal */}
          <GeneratePlanModal form={form} />


          {/* Planning grid */}
          <PlanningGrid form={form} />


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
