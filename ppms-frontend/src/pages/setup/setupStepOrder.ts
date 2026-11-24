import type { SetupChecklist, SetupStep } from '../../api/pumpApi'
import type { SectionKey } from './sectionKey'

export type StepState = 'done' | 'toDo' | 'optional'

export interface SetupStepDefinition {
  key: SectionKey
  /** The checklist item that says whether this step is done; steps without one are optional extras. */
  checklistStep?: SetupStep
}

/** The order an owner sets a new pump up in, matching the setup checklist. */
export const SETUP_STEPS: readonly SetupStepDefinition[] = [
  { key: 'nozzles',  checklistStep: 'DISPENSERS' },
  { key: 'tanks',    checklistStep: 'TANKS' },
  { key: 'prices',   checklistStep: 'FUEL_PRICES' },
  { key: 'shifts',   checklistStep: 'SHIFT_DEFINITIONS' },
  { key: 'staff',    checklistStep: 'STAFF' },
  { key: 'gst',      checklistStep: 'GST_DETAILS' },
  { key: 'credit',   checklistStep: 'CREDIT_CLIENTS' },
  { key: 'tankers' },
  { key: 'settings' },
]

export function isSectionKey(value: string | null): value is SectionKey {
  return SETUP_STEPS.some((step) => step.key === value)
}

export function stepState(step: SetupStepDefinition, checklist: SetupChecklist | undefined): StepState {
  const item = checklist?.items.find((entry) => entry.step === step.checklistStep)
  if (!item) return 'optional'
  if (item.done) return 'done'
  return item.optional ? 'optional' : 'toDo'
}

/** Where to start when the address names no step: the first required step not yet done, or the first step. */
export function firstStepToDo(checklist: SetupChecklist | undefined): SectionKey {
  return SETUP_STEPS.find((step) => stepState(step, checklist) === 'toDo')?.key ?? SETUP_STEPS[0].key
}

/** The current address with only the step changed; a one-off ?action= is dropped. */
export function searchForStep(current: URLSearchParams, key: SectionKey): string {
  const next = new URLSearchParams(current)
  next.delete('action')
  next.set('section', key)
  return `?${next.toString()}`
}

/** The current address without a step or ?action=, which opens the settings hub once setup is complete. */
export function searchForHub(current: URLSearchParams): string {
  const next = new URLSearchParams(current)
  next.delete('action')
  next.delete('section')
  const search = next.toString()
  return search ? `?${search}` : ''
}

export function isSetupComplete(checklist: SetupChecklist | undefined): boolean {
  return !!checklist && checklist.doneCount === checklist.requiredCount
}
