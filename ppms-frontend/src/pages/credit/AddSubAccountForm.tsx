import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient as PumpCreditClient } from '../../api/pumpApi'
import { FormField } from '../../components/FormField'
import { LoadingButton } from '../../components/LoadingButton'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'
import { parseApiError } from '../../utils/apiError'

interface AddSubAccountFormProps {
  pumpId: number
  parent: PumpCreditClient
  subAccounts: PumpCreditClient[]
  onAdded: () => void
  onCancel: () => void
}

export function AddSubAccountForm({ pumpId, parent, subAccounts, onAdded, onCancel }: AddSubAccountFormProps) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const optional = <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span>

  const addMutation = useMutation({
    mutationFn: () => pumpApi.createCreditClient(pumpId, {
      name: name.trim(), phone: phone.trim(), notes: notes.trim() || undefined, parentClientId: parent.id,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creditClients', pumpId] })
      onAdded()
    },
    onError: (err) => setError(parseApiError(err, t('clients.addFailed'))),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null)
    const trimmedName = name.trim()
    if (!/^\d{10}$/.test(phone.trim())) { setError(t('clients.phoneInvalid')); return }
    if (subAccounts.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      setError(t('clients.duplicateSubAccount', { name: trimmedName })); return
    }
    addMutation.mutate()
  }

  return (
    <form onSubmit={submit}
      aria-label={t('clients.addSubAccountUnder', { name: parent.name })}
      className="space-y-3 border-t border-border bg-surface-sunken px-3 py-3">
      <p className="text-sm font-semibold text-ink">{t('clients.addSubAccountUnder', { name: parent.name })}</p>
      <FormGrid>
        <FormField label={t('clientForm.name')}>
          <input required value={name} onChange={e => setName(e.target.value)} placeholder={t('clients.subNamePlaceholder')} />
        </FormField>
        <FormField label={t('clientForm.phone')}>
          <input required value={phone} type="tel" autoComplete="off"
            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            inputMode="numeric" maxLength={10} placeholder={t('clients.phonePlaceholder')} />
        </FormField>
        <FormGridFullRow>
          <FormField label={<>{t('common:fields.notes')} {optional}</>}>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('clients.subNotesPlaceholder')} />
          </FormField>
        </FormGridFullRow>
      </FormGrid>
      {error && <p role="alert" className="ui-error-text">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <LoadingButton type="submit" isLoading={addMutation.isPending} loadingLabel={t('clients.adding')} className="ui-btn-primary">
          {t('clients.addSubAccount')}
        </LoadingButton>
        <button type="button" onClick={onCancel} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
      </div>
    </form>
  )
}
