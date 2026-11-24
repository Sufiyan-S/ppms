import { useTranslation } from 'react-i18next'

/** One segment per step, filled once that step is done, with an "n of 4 done" count beside it. */
export function OpenShiftProgress({ doneSteps }: { doneSteps: boolean[] }) {
  const { t } = useTranslation('shifts')
  const doneCount = doneSteps.filter(Boolean).length
  return (
    <div className="mt-2 flex items-center gap-3">
      <div aria-hidden="true" className="flex max-w-48 flex-1 gap-1">
        {doneSteps.map((isDone, index) => (
          <span key={index} className={`ui-step-progress__segment ${isDone ? 'ui-step-progress__segment--done' : ''}`} />
        ))}
      </div>
      <p className="text-xs font-medium text-ink-2" aria-live="polite">
        {t('open.progress', { done: doneCount, total: doneSteps.length })}
      </p>
    </div>
  )
}
