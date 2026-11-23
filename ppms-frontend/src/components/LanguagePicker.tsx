import { useTranslation } from 'react-i18next'
import { DRAFT_LOCALES, LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES, isAppLanguage } from '../i18n/languages'
import type { AppLanguage } from '../i18n/languages'
import { FormField } from './FormField'

interface LanguagePickerProps {
  value: AppLanguage
  onChange: (language: AppLanguage) => void
  disabled?: boolean
  error?: string | null
  className?: string
  labelClassName?: string
  selectClassName?: string
}

/** Languages listed by their own names; Hindi and Marathi carry a note while their translations await native review. */
export function LanguagePicker({ value, onChange, disabled = false, error, className, labelClassName, selectClassName }: LanguagePickerProps) {
  const { t } = useTranslation()
  return (
    <FormField
      label={t('language.label')}
      help={DRAFT_LOCALES.includes(value) ? t('language.draftNote') : undefined}
      error={error ?? undefined}
      className={className}
      labelClassName={labelClassName}
    >
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => { if (isAppLanguage(event.target.value)) onChange(event.target.value) }}
        className={selectClassName}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language} lang={language}>{LANGUAGE_NATIVE_NAMES[language]}</option>
        ))}
      </select>
    </FormField>
  )
}
