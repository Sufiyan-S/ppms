import { CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ModalTone } from './Modal'

const TONE_ICONS: Record<Exclude<ModalTone, 'neutral'>, LucideIcon> = {
  info: Info,
  warning: TriangleAlert,
  danger: OctagonAlert,
  success: CircleCheck,
}

/** The tone's icon in a softly tinted square beside a dialog title; neutral dialogs show none. */
export function ModalToneIcon({ tone }: { tone: ModalTone }) {
  if (tone === 'neutral') return null
  const Icon = TONE_ICONS[tone]
  return (
    <span className="ui-modal-tone-icon" aria-hidden="true">
      <Icon size={20} strokeWidth={2} />
    </span>
  )
}
