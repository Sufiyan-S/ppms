import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SetupChecklist } from '../../api/pumpApi'
import type { SectionKey } from './sectionKey'
import { SETUP_STEPS } from './setupStepOrder'
import { SetupProgressRing } from './SetupProgressRing'
import { SetupStepItems } from './SetupStepItems'

interface SetupStepListProps {
  currentStep: SectionKey
  checklist: SetupChecklist | undefined
}

/**
 * The setup stepper: a progress ring, then every step as a connected list. A column beside the step on desktop;
 * on phones a compact header with the current step, and the full list behind an "All steps" button.
 */
export function SetupStepList({ currentStep, checklist }: SetupStepListProps) {
  const { t } = useTranslation('setup')
  const listId = useId()
  const [isOpenOnPhone, setOpenOnPhone] = useState(false)
  const currentIndex = SETUP_STEPS.findIndex((step) => step.key === currentStep)

  return (
    <nav aria-label={t('steps.listLabel')} className="ui-card min-w-0 p-0 lg:sticky lg:top-4">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        {checklist && <SetupProgressRing done={checklist.doneCount} required={checklist.requiredCount} />}
        <div className="min-w-0 flex-1">
          {checklist && (
            <p className="text-sm font-semibold text-ink">
              {t('checklist.doneCount', { done: checklist.doneCount, required: checklist.requiredCount })}
            </p>
          )}
          <p className="text-xs text-ink-3">
            {t('steps.position', { current: currentIndex + 1, total: SETUP_STEPS.length })}
            <span className="lg:hidden"> · {t(`steps.names.${currentStep}`)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenOnPhone(!isOpenOnPhone)}
          aria-expanded={isOpenOnPhone}
          aria-controls={listId}
          className="ui-btn ui-btn-ghost ui-btn-compact shrink-0 lg:hidden"
        >
          {t('steps.allSteps')}
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${isOpenOnPhone ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <SetupStepItems
        id={listId}
        currentStep={currentStep}
        checklist={checklist}
        replace
        onNavigate={() => setOpenOnPhone(false)}
        className={`${isOpenOnPhone ? 'flex' : 'hidden'} lg:flex`}
      />
    </nav>
  )
}
