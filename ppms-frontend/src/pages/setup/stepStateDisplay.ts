import { AlertTriangle, Check, Circle, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { StatusTone } from '../../components/StatusBadge'
import type { StepState } from './setupStepOrder'

export const STEP_STATE_BADGE: Record<StepState, { tone: StatusTone; icon: LucideIcon }> = {
  done: { tone: 'ok', icon: Check },
  toDo: { tone: 'warn', icon: AlertTriangle },
  optional: { tone: 'neutral', icon: Circle },
}

export function useStepStateLabel() {
  const { t } = useTranslation(['setup', 'common'])
  return (state: StepState) =>
    state === 'done' ? t('common:actions.done') : state === 'toDo' ? t('checklist.toDo') : t('common:fields.optional')
}
