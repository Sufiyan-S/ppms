import { useEffect } from 'react'

const DRAFT_PREFIX = 'ppms_draft:'
const SAVE_DELAY_MS = 400
const MAX_DRAFT_AGE_MS = 48 * 60 * 60 * 1000

export interface FormDraft<T> {
  savedAt: number
  values: T
}

export function readDraft<T>(name: string): FormDraft<T> | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + name)
    if (!raw) return null
    const draft = JSON.parse(raw) as FormDraft<T>
    if (Date.now() - draft.savedAt > MAX_DRAFT_AGE_MS) {
      removeDraft(name)
      return null
    }
    return draft
  } catch (error) {
    console.warn(`Could not read the saved draft ${name}; the form starts empty.`, error)
    return null
  }
}

export function writeDraft<T>(name: string, values: T): void {
  try {
    localStorage.setItem(DRAFT_PREFIX + name, JSON.stringify({ savedAt: Date.now(), values }))
  } catch (error) {
    console.warn(`Could not save the draft ${name}; entries will not survive a reload.`, error)
  }
}

export function removeDraft(name: string): void {
  try {
    localStorage.removeItem(DRAFT_PREFIX + name)
  } catch (error) {
    console.warn(`Could not remove the saved draft ${name}.`, error)
  }
}

/** Pump phones are shared, so drafts must not outlive the session that typed them. */
export function removeAllDrafts(): void {
  try {
    const draftKeys = Object.keys(localStorage).filter((key) => key.startsWith(DRAFT_PREFIX))
    draftKeys.forEach((key) => localStorage.removeItem(key))
  } catch (error) {
    console.warn('Could not remove saved drafts at sign-out.', error)
  }
}

/** Saves a form's entries shortly after each change; when `shouldSave` is false (empty form, or already submitted) the draft is removed. */
export function useSaveDraft<T>(name: string, values: T, shouldSave: boolean) {
  const serializedValues = JSON.stringify(values)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (shouldSave) writeDraft(name, JSON.parse(serializedValues) as T)
      else removeDraft(name)
    }, SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [name, serializedValues, shouldSave])
}
