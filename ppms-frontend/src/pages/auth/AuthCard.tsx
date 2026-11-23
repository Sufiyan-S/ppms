import { useId } from 'react'
import type { ReactNode } from 'react'
import { Fuel } from 'lucide-react'
import { LanguagePicker } from '../../components/LanguagePicker'
import { activeLanguage, changeAppLanguage } from '../../i18n'
import { storeLanguage } from '../../i18n/detectLanguage'
import type { AppLanguage } from '../../i18n/languages'

function chooseLanguage(language: AppLanguage) {
  storeLanguage(language)
  changeAppLanguage(language).catch((error: unknown) => console.error('Could not switch the screen language', error))
}

interface AuthCardProps {
  title: ReactNode
  description?: ReactNode
  /** Shown above the title, e.g. a success tick. */
  icon?: ReactNode
  /** Below the language picker, e.g. "Back to login". */
  footer?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * The card every signed-out screen uses: PPMS mark, one h1 and its description, the content,
 * then the language picker and any footer links in the same place on every screen.
 */
export function AuthCard({ title, description, icon, footer, className = '', children }: AuthCardProps) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={`ui-auth-card flex flex-col gap-5 ${className}`}>
      <header className="space-y-2">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <Fuel size={18} strokeWidth={2} aria-hidden="true" className="text-accent" />
          PPMS
        </p>
        {icon}
        <h1 id={titleId} className="ui-title-sm">{title}</h1>
        {description && <p className="ui-subtitle">{description}</p>}
      </header>
      {children}
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <LanguagePicker value={activeLanguage()} onChange={chooseLanguage} className="max-w-48" />
        {footer}
      </div>
    </section>
  )
}

/** The page behind a signed-out screen: the card centred, with room to scroll on short phones. */
export function AuthScreen({ children }: { children: ReactNode }) {
  return <main id="main-content" className="ui-auth-shell ui-auth-shell--split">{children}</main>
}
