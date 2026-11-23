import { ChevronLeft, ChevronRight, Check, Sparkles, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../../../components/StatusBadge'
import { Reveal } from '../../../components/Reveal'
import { formatIstDate } from '../../../utils/date'
import { IconButton } from '../../../components/IconButton'
import type { ShiftPlanning } from './useShiftPlanning'

export function WeekNavigator({ form }: { form: ShiftPlanning }) {
  const { t } = useTranslation('shifts')
  const { isOwnerOrAdmin, weekStart, setShowGenerate, setGenError, plan, publishMutation, prevWeek, nextWeek, isWeekEntirelyPast } = form
  return (
             <Reveal delay={130}>
             <div className="ui-card flex flex-wrap items-center justify-between gap-3">
               <div className="flex items-center gap-3">
                 <IconButton onClick={prevWeek}
                   className="ui-btn ui-btn-secondary px-3 py-2 text-ink-3"
    label={t('planning.week.previous')}
    icon={<ChevronLeft size={14} strokeWidth={2} />}
    />
                 <span className="text-sm font-semibold text-ink">
                   {t('planning.week.weekOf', { date: formatIstDate(weekStart, { day: 'numeric', month: 'long', year: 'numeric' }) })}
                 </span>
                 <IconButton onClick={nextWeek}
                   className="ui-btn ui-btn-secondary px-3 py-2 text-ink-3"
    label={t('planning.week.next')}
    icon={<ChevronRight size={14} strokeWidth={2} />}
    />
               </div>

               <div className="flex items-center gap-2">
                 {plan && (
                   plan.status === 'PUBLISHED'
                     ? <StatusBadge tone="ok" icon={Check} label={t('planning.week.published')} />
                     : <StatusBadge tone="warn" icon={Pencil} label={t('planning.week.draft')} />
                 )}
                 {isOwnerOrAdmin && (
                   <>
                     <button
                       onClick={() => { setShowGenerate(true); setGenError(null) }}
                       disabled={isWeekEntirelyPast}
                       title={isWeekEntirelyPast ? t('planning.week.pastWeek') : undefined}
                       className="ui-btn ui-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                     >
                       {plan ? t('planning.week.regenerate') : <span className="inline-flex items-center gap-1.5"><Sparkles size={13} strokeWidth={2} />{t('planning.week.autoGenerate')}</span>}
                     </button>
                     {plan && plan.status === 'DRAFT' && (
                       <button
                         onClick={() => publishMutation.mutate()}
                         disabled={publishMutation.isPending}
                         className="ui-btn ui-btn-primary border-ok bg-ok disabled:opacity-60"
                       >
                         {publishMutation.isPending ? t('planning.week.publishing') : t('planning.week.publish')}
                       </button>
                     )}
                   </>
                 )}
               </div>
             </div>
             </Reveal>
  )
}
