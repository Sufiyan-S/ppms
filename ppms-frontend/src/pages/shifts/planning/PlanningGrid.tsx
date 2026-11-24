import { Moon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SkeletonTable } from '../../../components/Skeleton'
import { Reveal } from '../../../components/Reveal'
import { SHIFT_ROW_ACCENTS, formatDay, formatShiftWindow } from './planningHelpers'
import { PlanningSlotCell } from './PlanningSlotCell'
import type { ShiftPlanning } from './useShiftPlanning'
import { ScrollRegion } from '../../../components/ScrollRegion'

export function PlanningGrid({ form }: { form: ShiftPlanning }) {
  const { t } = useTranslation(['shifts', 'common'])
  const { isOwnerOrAdmin, plan, planLoading, sortedDefs, days, today } = form
  return (
             <Reveal delay={200}>
             {planLoading ? (
               <div className="ui-card px-5 py-4"><SkeletonTable rows={4} cols={7} /></div>
             ) : (
               <>
                 {/* No-plan notice for future weeks */}
                 {!plan && days.some(d => d >= today) && (
                   <div className="ui-card-plain ui-card-muted px-5 py-3 text-sm text-ink-3 text-center">
                     {isOwnerOrAdmin
                       ? `${t('planning.grid.noPlanOwner')} ${t('planning.grid.noPlanHint')}`
                       : t('planning.grid.noPlanStaff')}
                   </div>
                 )}

                 <ScrollRegion label={t('planning.grid.regionLabel')} className="ui-card p-0 overflow-x-auto">
                   <table className="w-full text-xs border-collapse min-w-[640px]">
                     <thead>
                       <tr className="border-b border-border">
                         <th scope="col" className="ui-plan-shift-cell text-left text-xs font-semibold text-ink-2">
                           {t('planning.grid.shift')}
                         </th>
                         {days.map(day => (
                           <th scope="col" key={day} className={`px-2 py-3 text-center font-semibold ${day < today ? 'text-ink-3' : 'text-ink-2'}`}>
                             {formatDay(day)}
                             {day < today && (
                               <div className="text-xs font-normal text-ink-3 mt-0.5">{t('planning.grid.actual')}</div>
                             )}
                           </th>
                         ))}
                       </tr>
                     </thead>
                     <tbody>
                       {sortedDefs.length === 0 ? (
                         <tr>
                           <td colSpan={8} className="px-3 py-6 text-center text-sm text-ink-3">
                             {t('planning.grid.noDefinitions')}
                           </td>
                         </tr>
                       ) : sortedDefs.map((def, defIdx) => {
                         const accent = SHIFT_ROW_ACCENTS[defIdx % SHIFT_ROW_ACCENTS.length]
                         return (
                           <tr key={def.id} className="border-b border-border">
                             <th scope="row" className={`ui-plan-shift-cell text-left font-normal ${accent}`}>
                               <span className="flex items-center gap-1.5 text-sm font-semibold leading-5 text-ink">
                                 {def.name}
                                 {def.isNightShift && (
                                   <span role="img" aria-label={t('planning.grid.nightShift')} title={t('planning.grid.nightShift')} className="inline-flex text-ink-3">
                                     <Moon size={14} strokeWidth={2} aria-hidden="true" />
                                   </span>
                                 )}
                               </span>
                               <span className="mt-0.5 block whitespace-nowrap text-xs text-ink-3 tabular-nums">
                                 {formatShiftWindow(def)}
                                 {def.crossesMidnight && (
                                   <span className="ml-1 font-medium text-ink-2">{t('planning.grid.nextDay')}</span>
                                 )}
                               </span>
                             </th>
                             {days.map(day => <PlanningSlotCell key={day} form={form} day={day} shiftDefinitionId={def.id} />)}
                           </tr>
                         )
                       })}
                     </tbody>
                   </table>
                 </ScrollRegion>
               </>
             )}
             </Reveal>
  )
}
