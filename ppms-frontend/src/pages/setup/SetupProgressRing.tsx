import { useTranslation } from 'react-i18next'

/** How many required setup steps are done, as a ring with "done/required" in the middle. */
export function SetupProgressRing({ done, required }: { done: number; required: number }) {
  const { t } = useTranslation('setup')
  const gap = 100 - Math.round((done / Math.max(1, required)) * 100)
  return (
    <span
      role="progressbar"
      aria-label={t('checklist.progress')}
      aria-valuemin={0}
      aria-valuemax={required}
      aria-valuenow={done}
      aria-valuetext={t('checklist.doneCount', { done, required })}
      className="ui-progress-ring"
    >
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="ui-progress-ring__track" cx="18" cy="18" r="15" pathLength={100} />
        <circle className="ui-progress-ring__fill" cx="18" cy="18" r="15" pathLength={100} strokeDasharray="100" strokeDashoffset={gap} />
      </svg>
      <span aria-hidden="true">{done}/{required}</span>
    </span>
  )
}
