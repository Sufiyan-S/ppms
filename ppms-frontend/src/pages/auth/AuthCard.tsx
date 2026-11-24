import { useId } from 'react'
import type { ReactNode } from 'react'
import { activeLanguage, changeAppLanguage } from '../../i18n'
import { storeLanguage } from '../../i18n/detectLanguage'
import type { AppLanguage } from '../../i18n/languages'
import { AuthBrandPanel } from './AuthBrandPanel'
import type { BrandMessage } from './AuthBrandPanel'
import { LanguageSwitcher } from './LanguageSwitcher'

function chooseLanguage(language: AppLanguage) {
  storeLanguage(language)
  changeAppLanguage(language).catch((error: unknown) => console.error('Could not switch the screen language', error))
}

interface AuthCardProps {
  title: ReactNode
  description?: ReactNode
  /** Shown above the title, e.g. a success tick. */
  icon?: ReactNode
  /** Below the content, e.g. "Back to login". */
  footer?: ReactNode
  /** Told when the person picks a language here, after the screen has started switching. */
  onLanguagePicked?: (language: AppLanguage) => void
  children: ReactNode
}

/**
 * The form side every signed-out screen uses: the language switcher at the top, one h1 and its description,
 * the content, then any footer links in the same place on every screen.
 */
export function AuthCard({ title, description, icon, footer, onLanguagePicked, children }: AuthCardProps) {
  const titleId = useId()

  const pickLanguage = (language: AppLanguage) => {
    chooseLanguage(language)
    onLanguagePicked?.(language)
  }

  return (
    <section aria-labelledby={titleId} className="ui-auth-panel">
      <div className="ui-auth-panel__top">
        <LanguageSwitcher value={activeLanguage()} onChange={pickLanguage} />
      </div>
      <header className="ui-auth-panel__head">
        {icon}
        <h1 id={titleId} className="ui-auth-panel__title">{title}</h1>
        {description && <p className="ui-auth-panel__description">{description}</p>}
      </header>
      {children}
      {footer && <div className="ui-auth-panel__footer">{footer}</div>}
    </section>
  )
}

/** The split page behind a signed-out screen: the brand half, then the form half, which scrolls on short phones. */
export function AuthScreen({ brandMessage, children }: { brandMessage?: BrandMessage; children: ReactNode }) {
  return (
    <main id="main-content" className="ui-auth-screen">
      <AuthBrandPanel message={brandMessage} />
      <div className="ui-auth-screen__form">{children}</div>
    </main>
  )
}
