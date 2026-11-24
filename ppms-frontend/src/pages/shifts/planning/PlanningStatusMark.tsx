import type { ReactNode } from 'react'
import { Check, Circle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ShiftPlanEntryStatus } from '../../../api/shiftPlanApi'

const STATUSES: ShiftPlanEntryStatus[] = ['PLANNED', 'CONFIRMED', 'ABSENT']

const STATUS_BADGE: Record<ShiftPlanEntryStatus, string> = {
  PLANNED:   'bg-surface-sunken text-ink-2',
  CONFIRMED: 'bg-ok-bg text-ok',
  ABSENT:    'bg-bad-bg text-bad',
}

const STATUS_ICON: Record<ShiftPlanEntryStatus, ReactNode> = {
  PLANNED:   <Circle size={8} fill="currentColor" strokeWidth={0} />,
  CONFIRMED: <Check size={10} strokeWidth={2.5} />,
  ABSENT:    <X size={10} strokeWidth={2.5} />,
}

const STATUS_LABEL_KEY = {
  PLANNED:   'planning.legend.planned',
  CONFIRMED: 'planning.legend.confirmed',
  ABSENT:    'planning.legend.absent',
} as const

function StatusIcon({ status, className = '' }: { status: ShiftPlanEntryStatus; className?: string }) {
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center rounded-full px-1.5 py-0.5 ${STATUS_BADGE[status]} ${className}`}>
      {STATUS_ICON[status]}
    </span>
  )
}

/** The status icon beside an operator's name; the legend explains the icons and screen readers hear the status. */
export function PlanningStatusMark({ status }: { status: ShiftPlanEntryStatus }) {
  const { t } = useTranslation('shifts')
  return (
    <>
      <StatusIcon status={status} className="ml-auto" />
      <span className="sr-only">{t(STATUS_LABEL_KEY[status])}</span>
    </>
  )
}

export function PlanningLegend() {
  const { t } = useTranslation('shifts')
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-ink-3">
      {STATUSES.map(status => (
        <li key={status} className="flex items-center gap-1.5">
          <StatusIcon status={status} />
          {t(STATUS_LABEL_KEY[status])}
        </li>
      ))}
    </ul>
  )
}
