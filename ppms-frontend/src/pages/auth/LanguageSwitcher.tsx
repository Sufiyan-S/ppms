import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { DRAFT_LOCALES, LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '../../i18n/languages'
import type { AppLanguage } from '../../i18n/languages'

interface LanguageSwitcherProps {
  value: AppLanguage
  onChange: (language: AppLanguage) => void
}

/** A segmented row of radio buttons, each language named in its own script; arrow keys move between them. */
export function LanguageSwitcher({ value, onChange }: LanguageSwitcherProps) {
  const { t } = useTranslation()
  const groupName = useId()
  const draftNoteId = useId()
  const isDraft = DRAFT_LOCALES.includes(value)

  return (
    <div className="ui-auth-language">
      <div
        role="radiogroup"
        aria-label={t('language.label')}
        aria-describedby={isDraft ? draftNoteId : undefined}
        className="ui-auth-language__options"
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <label key={language} className="ui-auth-language__option">
            <input
              type="radio"
              name={groupName}
              value={language}
              checked={value === language}
              onChange={() => onChange(language)}
              className="sr-only"
            />
            <span lang={language}>{LANGUAGE_NATIVE_NAMES[language]}</span>
          </label>
        ))}
      </div>
      {isDraft && <p id={draftNoteId} className="ui-auth-language__note">{t('language.draftNote')}</p>}
    </div>
  )
}
