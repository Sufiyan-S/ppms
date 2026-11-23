import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../../utils/apiError'
import { userApi } from '../../../api/userApi'
import type { CreateUserRequest, UserGender } from '../../../api/userApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { codeLabel } from '../../../constants/labels'
import { PasswordInput } from '../../../components/PasswordInput'
import { EMPTY_FORM } from './staffForm'
import type { StaffCreateForm } from './staffForm'
import { FormField } from '../../../components/FormField'
import { PASSWORD_POLICY_REGEX } from '../../../constants/passwordPolicy'
import { LanguagePicker } from '../../../components/LanguagePicker'
import { isAppLanguage } from '../../../i18n/languages'
import { FormGrid, FormGridFullRow } from '../../../components/layout/FormGrid'
import { StickyActions } from '../../../components/layout/StickyActions'
import { NightShiftConsentField } from './NightShiftConsentField'

interface FieldErrors {
  gender?: string
  password?: string
}

/** onCancel shows a Close button, for when the form was opened on request rather than shown for an empty staff list. */
export function AddStaffForm({ pumpId, canAssignAdmin, onCancel }: { pumpId: number; canAssignAdmin: boolean; onCancel?: () => void }) {
  const { t } = useTranslation(['setup', 'auth', 'common'])
  const titleId = useId()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const mutation = useMutation({
    mutationFn: (req: CreateUserRequest) => userApi.createUser(req),
    onSuccess: () => {
      setForm(EMPTY_FORM); setError(null); setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      queryClient.invalidateQueries({ queryKey: ['staff', pumpId] })
      queryClient.invalidateQueries({ queryKey: ['operators', pumpId] })
    },
    onError: (err) => setError(parseApiError(err, t('staff.add.failed'))),
  })

  const set = <K extends keyof StaffCreateForm>(field: K, value: StaffCreateForm[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null)
    const nextErrors: FieldErrors = {}
    if (!form.gender) nextErrors.gender = t('staff.add.genderRequired')
    if (!PASSWORD_POLICY_REGEX.test(form.password)) nextErrors.password = t('auth:passwordPolicy')
    setFieldErrors(nextErrors)
    if (nextErrors.gender || nextErrors.password || !form.gender) return
    mutation.mutate({
      ...form,
      gender: form.gender,
      nightShiftConsent: form.role === 'OPERATOR' && form.gender === 'FEMALE' ? form.nightShiftConsent : false,
      assignedPumpId: pumpId,
    })
  }

  return (
    <form onSubmit={submit} aria-labelledby={titleId} className="ui-card-plain ui-card-muted p-4 md:p-5">
      <div className="mb-4 flex flex-col gap-0.5 border-b border-border pb-3">
        <h3 id={titleId} className="text-base font-semibold text-ink">{t('staff.add.title')}</h3>
        <p className="text-sm text-ink-3">{t('staff.add.subtitle')}</p>
      </div>

      <FormGrid>
        <FormField label={t('staff.fullName')}>
          <input required value={form.fullName} onChange={(e) => set('fullName', e.target.value)}
            autoComplete="off" className="text-sm" />
        </FormField>
        <FormField label={t('staff.phone')} help={t('staff.phoneHelp')}>
          <input required type="tel" inputMode="numeric" value={form.phoneNumber}
            onChange={(e) => set('phoneNumber', e.target.value)}
            maxLength={10} autoComplete="off" className="text-sm" />
        </FormField>
        <div>
          <span className="ui-label">{t('staff.gender')}</span>
          <SearchableSelect label={t('staff.gender')}
            value={form.gender}
            onChange={v => {
              setFieldErrors((prev) => ({ ...prev, gender: undefined }))
              setForm(prev => ({
                ...prev,
                gender: v as UserGender,
                nightShiftConsent: prev.role === 'OPERATOR' && v === 'FEMALE' ? prev.nightShiftConsent : false,
              }))
            }}
            placeholder={t('staff.selectGender')}
            options={[
              { value: 'MALE', label: codeLabel('MALE') },
              { value: 'FEMALE', label: codeLabel('FEMALE') },
              { value: 'OTHER', label: codeLabel('OTHER') },
            ]}
          />
          {fieldErrors.gender && <p role="alert" className="ui-error-text">{fieldErrors.gender}</p>}
        </div>
        <div>
          <span className="ui-label">{t('staff.role')}</span>
          <SearchableSelect label={t('staff.role')}
            value={form.role}
            onChange={v => setForm(prev => ({
              ...prev,
              role: v as 'OPERATOR' | 'MANAGER' | 'ADMIN' | 'ACCOUNTANT',
              nightShiftConsent: v === 'OPERATOR' && prev.gender === 'FEMALE' ? prev.nightShiftConsent : false,
            }))}
            options={[
              { value: 'OPERATOR',   label: codeLabel('OPERATOR') },
              { value: 'MANAGER',    label: codeLabel('MANAGER') },
              ...(canAssignAdmin ? [{ value: 'ADMIN', label: codeLabel('ADMIN') }] : []),
              { value: 'ACCOUNTANT', label: codeLabel('ACCOUNTANT') },
            ]}
          />
        </div>
        <FormField label={t('staff.add.password')} error={fieldErrors.password}
          help={`${t('auth:passwordPolicy')} ${t('staff.add.passwordHint')}`}>
          <PasswordInput required value={form.password} autoComplete="new-password"
            onChange={(e) => { set('password', e.target.value); setFieldErrors((prev) => ({ ...prev, password: undefined })) }}
            className="text-sm" />
        </FormField>
        <LanguagePicker
          value={isAppLanguage(form.preferredLanguage) ? form.preferredLanguage : 'en'}
          onChange={(language) => set('preferredLanguage', language)}
          selectClassName="text-sm"
        />
        {form.role === 'OPERATOR' && form.gender === 'FEMALE' && (
          <FormGridFullRow>
            <NightShiftConsentField checked={!!form.nightShiftConsent} onChange={(checked) => set('nightShiftConsent', checked)} />
          </FormGridFullRow>
        )}
      </FormGrid>

      <StickyActions className="mt-4 items-center bg-surface-sunken">
        <div className="mr-auto min-h-5">
          {error && <p role="alert" className="ui-error-text mt-0">{error}</p>}
          {success && <p role="status" className="text-xs text-ok">{t('staff.add.success')}</p>}
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="ui-btn ui-btn-secondary">
            {t('common:actions.close')}
          </button>
        )}
        <button type="submit" disabled={mutation.isPending} className="ui-btn ui-btn-primary">
          {mutation.isPending ? t('actions.addingDots') : t('staff.add.submit')}
        </button>
      </StickyActions>
    </form>
  )
}
