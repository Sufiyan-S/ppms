import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SetupChecklist } from '../../api/pumpApi'
import type { SectionKey } from './sectionKey'
import { SETUP_STEPS, searchForStep, stepState } from './setupStepOrder'
import type { StepState } from './setupStepOrder'
import { STEP_STATE_BADGE, useStepStateLabel } from './stepStateDisplay'

const STATE_TEXT_TONE: Record<StepState, string> = { done: 'text-ok', toDo: 'text-warn', optional: 'text-ink-3' }

interface SetupStepItemsProps {
  id?: string
  currentStep: SectionKey | null
  checklist: SetupChecklist | undefined
  /** While stepping through setup a step change replaces the address entry; from the hub it adds one. */
  replace: boolean
  onNavigate?: () => void
  /** Horizontal lays the steps out in one row, for the finished checklist in the settings hub. */
  orientation?: 'vertical' | 'horizontal'
  className?: string
}

/** Every setup step in checklist order as a connected list: numbered dot, name, and its state in words. */
export function SetupStepItems({
  id, currentStep, checklist, replace, onNavigate, orientation = 'vertical', className = '',
}: SetupStepItemsProps) {
  const { t } = useTranslation('setup')
  const [searchParams] = useSearchParams()
  const currentLinkRef = useRef<HTMLAnchorElement>(null)
  const stateLabel = useStepStateLabel()
  const isHorizontal = orientation === 'horizontal'

  useEffect(() => {
    currentLinkRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [currentStep])

  return (
    <ol id={id} className={`${isHorizontal ? 'ui-stepper--horizontal' : 'flex-col gap-0.5 p-2'} ${className}`}>
      {SETUP_STEPS.map((step, index) => {
        const state = stepState(step, checklist)
        const StateIcon = STEP_STATE_BADGE[state].icon
        const isCurrent = step.key === currentStep
        return (
          <li key={step.key} className={`ui-stepper__item ${state === 'done' ? 'ui-stepper__item--done' : ''}`}>
            <Link
              ref={isCurrent ? currentLinkRef : undefined}
              to={{ search: searchForStep(searchParams, step.key) }}
              replace={replace}
              onClick={onNavigate}
              aria-current={isCurrent ? 'step' : undefined}
              className="ui-stepper__link"
            >
              <span aria-hidden="true" className={`ui-step-number ${state === 'done' ? 'ui-step-number--done' : ''} ${state === 'optional' ? 'ui-step-number--optional' : ''}`}>
                {state === 'done' ? <Check size={14} strokeWidth={3} /> : index + 1}
              </span>
              <span className={`min-w-0 ${isHorizontal ? '' : 'pt-0.5'}`}>
                <span className={`block text-sm ${isCurrent ? 'font-semibold text-ink' : 'font-medium text-ink-2'}`}>
                  {t(`steps.names.${step.key}`)}
                </span>
                <span className={`mt-0.5 flex items-center gap-1 text-xs ${isHorizontal ? 'justify-center' : ''} ${STATE_TEXT_TONE[state]}`}>
                  <StateIcon size={12} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />
                  {stateLabel(state)}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
