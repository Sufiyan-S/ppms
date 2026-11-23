import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FormField } from '../../../components/FormField'
import { FormGrid } from '../../../components/layout/FormGrid'
import { NumericInput } from '../../../components/NumericInput'
import { formatNumberIn } from '../../../i18n/format'

export interface TankerFieldErrors {
  name?: string
  capacity?: string
}

export function TankerForm({
  name, setName, capacity, setCapacity, tankerType, setTankerType, makeDefault, setMakeDefault, fieldErrors, error,
}: {
  name: string; setName: (v: string) => void
  capacity: string; setCapacity: (v: string) => void
  tankerType: 'OWN' | 'COMPANY'; setTankerType: (v: 'OWN' | 'COMPANY') => void
  makeDefault: boolean; setMakeDefault: (v: boolean) => void
  fieldErrors: TankerFieldErrors
  error: string | null
}) {
  const { t } = useTranslation('setup')
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameRef.current?.focus() }, [])

  const litres = Number(capacity)
  const capacityHelp = capacity.trim() !== '' && Number.isFinite(litres) && litres > 0
    ? t('tankers.capacityHelp', { litres: formatNumberIn(litres) })
    : undefined

  return (
    <div className="space-y-3">
      <FormGrid>
        <FormField label={t('tankers.name')} error={fieldErrors.name}>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('tankers.namePlaceholder')}
            className="text-sm"
          />
        </FormField>
        <FormField label={t('tankers.capacity')} help={capacityHelp} error={fieldErrors.capacity}>
          <NumericInput
            min="100"
            step="100"
            unit="L"
            value={capacity}
            onChange={e => setCapacity(e.target.value)}
          />
        </FormField>
        <FormField label={t('tankers.type')}>
          <select
            value={tankerType}
            onChange={e => setTankerType(e.target.value as 'OWN' | 'COMPANY')}
            className="ui-input text-sm"
          >
            <option value="COMPANY">{t('tankers.companyTanker')}</option>
            <option value="OWN">{t('tankers.ownTanker')}</option>
          </select>
        </FormField>
        <div className="flex items-end">
          <label className="ui-inline-check">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={e => setMakeDefault(e.target.checked)}
            />
            <span>{t('tankers.setAsDefault')}</span>
          </label>
        </div>
      </FormGrid>
      {error && <p role="alert" className="ui-error-text">{error}</p>}
    </div>
  )
}
