import { ChevronLeft, ChevronRight, Check, Sparkles, Circle } from 'lucide-react'
import { Reveal } from '../../../components/Reveal'
import { formatIstDate } from '../../../utils/date'
import { IconButton } from '../../../components/IconButton'
import type { ShiftPlanning } from './useShiftPlanning'

export function WeekNavigator({ form }: { form: ShiftPlanning }) {
  const { isOwnerOrAdmin, weekStart, setShowGenerate, setGenError, plan, publishMutation, prevWeek, nextWeek, isWeekEntirelyPast } = form
  return (
             <Reveal delay={130}>
             <div className="ui-card flex flex-wrap items-center justify-between gap-3">
               <div className="flex items-center gap-3">
                 <IconButton onClick={prevWeek}
                   className="ui-btn ui-btn-secondary px-3 py-2 text-slate-500"
    label="Previous week"
    icon={<ChevronLeft size={14} strokeWidth={2} />}
    />
                 <span className="text-sm font-semibold text-slate-700">
                   Week of {formatIstDate(weekStart, { day: 'numeric', month: 'long', year: 'numeric' })}
                 </span>
                 <IconButton onClick={nextWeek}
                   className="ui-btn ui-btn-secondary px-3 py-2 text-slate-500"
    label="Next week"
    icon={<ChevronRight size={14} strokeWidth={2} />}
    />
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
  )
}
