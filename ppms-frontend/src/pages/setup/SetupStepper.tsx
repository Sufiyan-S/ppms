import { useId } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Flag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SetupChecklist } from '../../api/pumpApi'
import { StatusBadge } from '../../components/StatusBadge'
import type { SectionKey } from './sectionKey'
import { SetupArea } from './SetupArea'
import type { SetupAreaProps } from './SetupArea'
import { SetupStepList } from './SetupStepList'
import { STEP_STATE_BADGE, useStepStateLabel } from './stepStateDisplay'
import { SETUP_STEPS, searchForStep, stepState } from './setupStepOrder'

type SetupStepperProps = Omit<SetupAreaProps, 'section' | 'titleMeta'> & {
  currentStep: SectionKey
  checklist: SetupChecklist | undefined
}

/** Setup while required steps are still to do: the stepper beside the open step, with Back and Next under it. */
export function SetupStepper({ currentStep, checklist, ...areaProps }: SetupStepperProps) {
  const { t } = useTranslation('setup')
  const [searchParams] = useSearchParams()
  const stateLabel = useStepStateLabel()
  const stillToDoId = useId()

  const index = SETUP_STEPS.findIndex((step) => step.key === currentStep)
  const previousStep = SETUP_STEPS[index - 1]
  const nextStep = SETUP_STEPS[index + 1]
  const state = stepState(SETUP_STEPS[index], checklist)
  const stepsToDo = SETUP_STEPS.filter((step) => stepState(step, checklist) === 'toDo')
  const stepName = (key: SectionKey) => t(`steps.names.${key}`)

  return (
    <div className="grid gap-(--density-gap) lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
      <SetupStepList currentStep={currentStep} checklist={checklist} />

      <div className="flex min-w-0 flex-col gap-(--density-gap)">
        <SetupArea
          {...areaProps}
          section={currentStep}
          titleMeta={<StatusBadge tone={STEP_STATE_BADGE[state].tone} icon={STEP_STATE_BADGE[state].icon} label={stateLabel(state)} />}
        />

        <nav aria-label={t('steps.navigationLabel')} className="flex flex-wrap items-center justify-between gap-2">
          {previousStep ? (
            <Link to={{ search: searchForStep(searchParams, previousStep.key) }} replace className="ui-btn ui-btn-secondary inline-flex items-center gap-1.5">
              <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
              {t('steps.back', { step: stepName(previousStep.key) })}
            </Link>
          ) : <span />}
          {nextStep ? (
            <Link to={{ search: searchForStep(searchParams, nextStep.key) }} replace className="ui-btn ui-btn-primary inline-flex items-center gap-1.5">
              {t('steps.next', { step: stepName(nextStep.key) })}
              <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
            </Link>
          ) : stepsToDo.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <p id={stillToDoId} className="text-xs text-warn">{t('steps.stillToDo', { count: stepsToDo.length })}</p>
              <Link to={{ search: searchForStep(searchParams, stepsToDo[0].key) }} replace aria-describedby={stillToDoId}
                className="ui-btn ui-btn-primary inline-flex items-center gap-1.5">
                <Flag size={14} strokeWidth={2} aria-hidden="true" />
                {t('steps.finish')}
              </Link>
            </div>
          )}
        </nav>
      </div>
    </div>
  )
}
