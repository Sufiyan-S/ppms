import { useId } from 'react'
import type { ReactNode, Ref } from 'react'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  step: number
  title: string
  isOpen: boolean
  isDone: boolean
  summary?: ReactNode
  pendingHint?: string
  /** Without it the collapsed step has no Change/Choose button. */
  onOpen?: () => void
  sectionRef?: Ref<HTMLElement>
  children: ReactNode
}

/** One numbered step of the Open Shift form, collapsing to a summary line with a Change button. */
export function OpenShiftSection({ step, title, isOpen, isDone, summary, pendingHint, onOpen, sectionRef, children }: Props) {
  const { t } = useTranslation('shifts')
  const id = useId()
  const headingId = `${id}-heading`
  const bodyId = `${id}-body`
  const collapsedText = isDone ? summary : pendingHint

  return (
    <section ref={sectionRef} aria-labelledby={headingId}
      className={`rounded-card border bg-surface ${isOpen ? 'border-control' : 'border-border'}`}>
      <div className="flex items-center gap-3 p-3">
        <span aria-hidden="true" className={`ui-step-number ${isDone ? 'ui-step-number--done' : ''}`}>
          {isDone ? <Check size={14} strokeWidth={3} /> : step}
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-sm font-semibold text-ink">
            {title}
            {isDone && <span className="sr-only">, {t('open.stepDone')}</span>}
          </h3>
          {!isOpen && collapsedText && <div className="mt-0.5 text-xs text-ink-2">{collapsedText}</div>}
        </div>
        {!isOpen && onOpen && (
          <button type="button" onClick={onOpen} aria-expanded={false} aria-controls={bodyId}
            aria-label={t(isDone ? 'open.changeStep' : 'open.chooseStep', { step: title })}
            className="ui-btn ui-btn-secondary ui-btn-compact min-h-11 shrink-0">
            {t(isDone ? 'open.change' : 'open.choose')}
          </button>
        )}
      </div>
      <div id={bodyId} data-step-body hidden={!isOpen} className="ui-accordion-content border-t border-border p-3">
        {isOpen && children}
      </div>
    </section>
  )
}
