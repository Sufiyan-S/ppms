import { useEffect, useId, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, ChevronDown, Circle, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SetupChecklist } from '../../api/pumpApi'
import type { SectionKey } from './sectionKey'
import { SETUP_STEPS, searchForStep, stepState } from './setupStepOrder'
import type { StepState } from './setupStepOrder'

const STATE_ICON: Record<StepState, LucideIcon> = { done: Check, toDo: AlertTriangle, optional: Circle }
const STATE_TONE: Record<StepState, string> = { done: 'text-ok', toDo: 'text-warn', optional: 'text-ink-3' }

interface SetupStepListProps {
  currentStep: SectionKey
  checklist: SetupChecklist | undefined
  /** Once every required step is done the list folds into one line until the owner opens it. */
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Every setup step as a link, in checklist order, each with its state in words. A column beside the step on
 * desktop; a row that scrolls sideways above it on phones and tablets.
 */
export function SetupStepList({ currentStep, checklist, isOpen, onOpenChange }: SetupStepListProps) {
  const { t } = useTranslation(['setup', 'common'])
  const [searchParams] = useSearchParams()
  const currentLinkRef = useRef<HTMLAnchorElement>(null)
  const listId = useId()
  const complete = !!checklist && checklist.doneCount === checklist.requiredCount
  const currentIndex = SETUP_STEPS.findIndex((step) => step.key === currentStep)

  useEffect(() => {
    currentLinkRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [currentStep])

  const stateLabel = (state: StepState) =>
    state === 'done' ? t('common:actions.done') : state === 'toDo' ? t('checklist.toDo') : t('common:fields.optional')

  const completeLine = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm">
      <span className="inline-flex items-center gap-1.5 font-medium text-ok">
        <Check size={16} strokeWidth={2.25} aria-hidden="true" />
        {t('steps.complete')}
      </span>
      <span aria-hidden="true" className="text-ink-3">·</span>
      <button
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={listId}
        className="ui-link inline-flex items-center gap-1 text-sm"
      >
        {t('steps.reviewChecklist')}
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
    </div>
  )

  return (
    <nav aria-label={t('steps.listLabel')} className={`ui-card min-w-0 p-0 ${isOpen ? 'lg:sticky lg:top-4' : ''}`}>
      {complete ? completeLine : checklist && (
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs font-medium text-ink-2">
            {t('checklist.doneCount', { done: checklist.doneCount, required: checklist.requiredCount })}
          </p>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-badge bg-surface-sunken"
            role="progressbar"
            aria-label={t('checklist.progress')}
            aria-valuemin={0}
            aria-valuemax={checklist.requiredCount}
            aria-valuenow={checklist.doneCount}
          >
            <div className="h-full bg-primary" style={{ width: `${(checklist.doneCount / Math.max(1, checklist.requiredCount)) * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-ink-3 lg:hidden">
            {t('steps.position', { current: currentIndex + 1, total: SETUP_STEPS.length })}
          </p>
        </div>
      )}
      <ol id={listId} hidden={!isOpen} className={`flex gap-2 ${complete ? 'border-t border-border' : ''} overflow-x-auto p-2 lg:flex-col lg:gap-0.5 lg:overflow-visible`}>
        {SETUP_STEPS.map((step, index) => {
          const state = stepState(step, checklist)
          const StateIcon = STATE_ICON[state]
          const isCurrent = step.key === currentStep
          return (
            <li key={step.key} className="shrink-0">
              <Link
                ref={isCurrent ? currentLinkRef : undefined}
                to={{ search: searchForStep(searchParams, step.key) }}
                replace
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex items-start gap-2.5 rounded-control border px-3 py-2 transition-colors ${
                  isCurrent ? 'border-primary bg-info-bg' : 'border-transparent hover:bg-bg'
                }`}
              >
                <span className="mt-0.5 w-5 shrink-0 text-xs font-semibold text-ink-3">{index + 1}.</span>
                <span className="min-w-0">
                  <span className={`block whitespace-nowrap text-sm lg:whitespace-normal ${isCurrent ? 'font-semibold text-ink' : 'font-medium text-ink-2'}`}>
                    {t(`steps.names.${step.key}`)}
                  </span>
                  <span className={`mt-0.5 flex items-center gap-1 text-xs ${STATE_TONE[state]}`}>
                    <StateIcon size={12} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />
                    {stateLabel(state)}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
