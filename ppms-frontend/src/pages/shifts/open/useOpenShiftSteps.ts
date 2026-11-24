import { useEffect, useRef, useState } from 'react'

export type OpenShiftStep = 'du' | 'nozzles' | 'operator'
type FocusTarget = OpenShiftStep | 'readings'

const STEP_ORDER: OpenShiftStep[] = ['du', 'nozzles', 'operator']

const SELECTED_CONTROL = "[data-step-body] [aria-pressed='true']:not(:disabled)"
const FIRST_CONTROL = '[data-step-body] button:not(:disabled), [data-step-body] input:not(:disabled)'

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Which numbered step of the Open Shift form is expanded. Until the user acts, the first unfinished step is open,
 * so steps filled in automatically start collapsed; after that the user's choice holds.
 */
export function useOpenShiftSteps(doneSteps: Record<OpenShiftStep, boolean>) {
  const [chosenStep, setChosenStep] = useState<OpenShiftStep | null | undefined>(undefined)
  const [focusRequest, setFocusRequest] = useState<{ target: FocusTarget } | null>(null)
  const sectionElements = useRef<Partial<Record<FocusTarget, HTMLElement | null>>>({})

  const openStep = chosenStep === undefined ? STEP_ORDER.find((step) => !doneSteps[step]) ?? null : chosenStep

  useEffect(() => {
    if (!focusRequest) return
    const section = sectionElements.current[focusRequest.target]
    if (!section) return
    section.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    const control = section.querySelector<HTMLElement>(SELECTED_CONTROL) ?? section.querySelector<HTMLElement>(FIRST_CONTROL)
    control?.focus({ preventScroll: true })
  }, [focusRequest])

  const openAndFocus = (step: OpenShiftStep | null) => {
    setChosenStep(step)
    setFocusRequest({ target: step ?? 'readings' })
  }

  /** Collapses a finished step and opens the next unfinished one, or moves on to the readings when all are done. */
  const finishStep = (step: OpenShiftStep, doneAfterChange: Partial<Record<OpenShiftStep, boolean>> = {}) => {
    const done = { ...doneSteps, [step]: true, ...doneAfterChange }
    openAndFocus(STEP_ORDER.find((s) => !done[s]) ?? null)
  }

  const sectionRef = (target: FocusTarget) => (element: HTMLElement | null) => {
    sectionElements.current[target] = element
  }

  return {
    openStep,
    reopenStep: openAndFocus,
    keepStepOpen: (step: OpenShiftStep) => setChosenStep(step),
    finishStep,
    sectionRef,
  }
}
