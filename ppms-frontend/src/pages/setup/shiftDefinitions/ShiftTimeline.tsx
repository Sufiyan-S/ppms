import { AlertTriangle, Check, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'
import { formatClock, percentOfDay, timelineCoverage } from './shiftCoverage'
import type { MinuteRange } from './shiftCoverage'

const SEGMENT_TINTS = [
  'bg-info-bg text-info border-primary',
  'bg-warn-bg text-warn-strong border-accent',
  'bg-ok-bg text-ok border-ok',
  'bg-neutral-bg text-neutral border-ink-3',
]
const TICK_HOURS = [0, 6, 12, 18, 24]

const rangeText = ({ start, end }: MinuteRange) => `${formatClock(start)} – ${formatClock(end)}`

/**
 * A schedule's shifts on a 24-hour bar, a night shift split at midnight, with any uncovered or doubly covered
 * hours written out underneath. The bar is a picture; its accessible name carries the same facts in words.
 */
export function ShiftTimeline({ definitions }: { definitions: ShiftDefinition[] }) {
  const { t } = useTranslation('setup')
  const { segments, laneCount, gaps, overlaps } = timelineCoverage(definitions)
  const description = definitions.map((definition) => `${definition.name}: ${definition.windowLabel}`).join('; ')

  return (
    <div className="space-y-2">
      <div role="img" aria-label={t('shiftDefs.timeline.label', { shifts: description })} className="ui-timeline">
        <div className="ui-timeline__bar" style={{ height: `${laneCount * 2}rem` }}>
          {TICK_HOURS.slice(1, -1).map((hour) => (
            <span key={hour} aria-hidden="true" className="ui-timeline__gridline" style={{ left: `${(hour / 24) * 100}%` }} />
          ))}
          {segments.map((segment) => (
            <span
              key={`${segment.shift.id}-${segment.start}`}
              title={`${segment.shift.name} · ${segment.shift.windowLabel}`}
              className={`ui-timeline__segment ${SEGMENT_TINTS[(segment.shift.sortOrder - 1) % SEGMENT_TINTS.length]}`}
              style={{
                left: `${percentOfDay(segment.start)}%`,
                width: `${percentOfDay(segment.end - segment.start)}%`,
                top: `${segment.lane * 2}rem`,
              }}
            >
              {segment.shift.name}
            </span>
          ))}
        </div>
        <div aria-hidden="true" className="ui-timeline__ticks">
          {TICK_HOURS.map((hour) => (
            <span key={hour} style={{ left: `${(hour / 24) * 100}%` }}>{String(hour).padStart(2, '0')}</span>
          ))}
        </div>
      </div>

      {definitions.length > 0 && gaps.length === 0 && overlaps.length === 0 && (
        <p className="flex items-start gap-1.5 text-xs text-ok">
          <Check size={14} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{t('shiftDefs.timeline.fullDay')}</span>
        </p>
      )}
      {gaps.map((gap) => (
        <p key={`gap-${gap.start}`} className="flex items-start gap-1.5 text-xs text-ink-2">
          <Clock size={14} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
          <span>{t('shiftDefs.timeline.gap', { range: rangeText(gap) })}</span>
        </p>
      ))}
      {overlaps.map((overlap) => (
        <p key={`overlap-${overlap.start}`} className="flex items-start gap-1.5 text-xs font-medium text-warn">
          <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{t('shiftDefs.timeline.overlap', { names: overlap.names.join(' & '), range: rangeText(overlap) })}</span>
        </p>
      ))}
    </div>
  )
}
