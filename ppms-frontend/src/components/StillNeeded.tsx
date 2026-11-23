import { CircleDashed } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  /** Given to the disabled action's aria-describedby so screen readers hear why it is unavailable. */
  id: string
  items: string[]
  className?: string
}

/** What is still missing before a form's main action can run, shown beside that action while it is disabled. */
export function StillNeeded({ id, items, className = '' }: Props) {
  const { t } = useTranslation()
  if (items.length === 0) return null
  return (
    <div id={id} className={`ui-still-needed ${className}`}>
      <p className="text-xs font-semibold text-ink-2">{t('form.stillNeeded')}</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-1.5 text-xs text-ink-2">
            <CircleDashed size={14} aria-hidden="true" className="mt-px shrink-0 text-ink-3" />{item}
          </li>
        ))}
      </ul>
    </div>
  )
}
