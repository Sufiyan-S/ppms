import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Moon, PauseCircle } from 'lucide-react'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import { parseApiError } from '../../../utils/apiError'
import { IconButton } from '../../../components/IconButton'
import { LoadingButton } from '../../../components/LoadingButton'
import { StatusBadge } from '../../../components/StatusBadge'
import { DisableSchedulePanel } from './DisableSchedulePanel'
import { ShiftTimeline } from './ShiftTimeline'
import type { ShiftSchedule } from './shiftScheduleGroups'

interface Props {
  pumpId: number
  schedule: ShiftSchedule
  isCollapsed: boolean
  onToggleCollapsed: () => void
}

/** One schedule: its dates and state, Disable and Delete, then its shifts on a 24-hour timeline and as a list. */
export function ShiftScheduleCard({ pumpId, schedule, isCollapsed, onToggleCollapsed }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  const qc = useQueryClient()
  const bodyId = useId()
  const [openPanel, setOpenPanel] = useState<'delete' | 'disable' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const { effectiveFrom, effectiveTo, isActive, definitions } = schedule

  const deleteMutation = useMutation({
    mutationFn: () => shiftDefinitionApi.deleteGroup(pumpId, effectiveFrom, effectiveTo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-definitions', pumpId] })
      qc.invalidateQueries({ queryKey: ['shift-definitions-active', pumpId] })
      setOpenPanel(null)
    },
    onError: (err) => {
      setOpenPanel(null)
      setActionError(parseApiError(err, t('shiftDefs.deleteFailed')))
    },
  })

  const open = (panel: 'delete' | 'disable') => { setActionError(null); setOpenPanel(panel) }

  return (
    <article aria-label={t('shiftDefs.scheduleLabel', { from: effectiveFrom })} className={`ui-card-plain overflow-hidden ${isActive ? '' : 'bg-bg'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button type="button" aria-expanded={!isCollapsed} aria-controls={bodyId} onClick={onToggleCollapsed}
          className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left md:min-h-8">
          <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={`ui-accordion-arrow shrink-0 text-ink-3 ${isCollapsed ? '' : 'ui-accordion-arrow--open'}`} />
          <span className="text-sm font-semibold text-ink tabular-nums">
            {effectiveTo ? `${effectiveFrom} – ${effectiveTo}` : `${effectiveFrom}${t('shiftDefs.onwards')}`}
          </span>
          {isActive
            ? <StatusBadge tone="ok" icon={Check} label={t('shiftDefs.active')} />
            : <StatusBadge tone="neutral" icon={PauseCircle} label={t('tanks.disabled')} />}
          <span className="text-xs text-ink-3">{t('shiftDefs.shiftCount', { count: definitions.length })}</span>
        </button>
        {openPanel === null && (
          <div className="flex items-center gap-1">
            {isActive && (
              <button type="button" onClick={() => open('disable')} className="ui-btn ui-btn-ghost ui-btn-compact">
                {t('common:actions.disable')}
              </button>
            )}
            <button type="button" onClick={() => open('delete')} className="ui-btn ui-btn-ghost ui-btn-compact">
              {t('shiftDefs.deleteGroup')}
            </button>
          </div>
        )}
      </div>

      {openPanel === 'delete' && (
        <div className="space-y-3 border-t border-border bg-surface-sunken px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-ink">{t('shiftDefs.deletePrompt')}</p>
            <p className="mt-0.5 text-xs text-ink-3">{t('shiftDefs.deleteConsequence')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setOpenPanel(null)} className="ui-btn ui-btn-secondary ui-btn-compact">
              {t('common:actions.cancel')}
            </button>
            <LoadingButton type="button" isLoading={deleteMutation.isPending} loadingLabel={t('shiftDefs.deleting')}
              onClick={() => deleteMutation.mutate()} className="ui-btn-danger ui-btn-compact">
              {t('shiftDefs.confirmDelete')}
            </LoadingButton>
          </div>
        </div>
      )}
      {openPanel === 'disable' && (
        <DisableSchedulePanel pumpId={pumpId} effectiveFrom={effectiveFrom} onClose={() => setOpenPanel(null)} onError={setActionError} />
      )}

      {actionError && (
        <div role="alert" className="ui-alert ui-alert-danger mx-4 mb-3 flex items-start gap-2">
          <span className="flex-1 text-xs">{actionError}</span>
          <IconButton onClick={() => setActionError(null)} className="ui-btn ui-btn-ghost text-sm leading-none text-bad hover:text-bad-strong"
            label={t('shiftDefs.dismissError')} icon="×" />
        </div>
      )}

      {!isCollapsed && (
        <div id={bodyId} className="ui-accordion-content space-y-4 border-t border-border px-4 py-4">
          <ShiftTimeline definitions={definitions} />
          <ul className="grid gap-2 sm:grid-cols-2">
            {definitions.map((definition) => (
              <li key={definition.id} className="flex items-center gap-3 rounded-control border border-border bg-surface px-3 py-2">
                <span aria-hidden="true" className="w-6 text-xs font-medium text-ink-3 tabular-nums">#{definition.sortOrder}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{definition.name}</p>
                  <p className="text-xs text-ink-3 tabular-nums">{definition.windowLabel}</p>
                </div>
                {definition.isNightShift && <StatusBadge tone="info" icon={Moon} label={t('shiftDefs.night')} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}
