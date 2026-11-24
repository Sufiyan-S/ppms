import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient as PumpCreditClient } from '../../api/pumpApi'
import { FormField } from '../../components/FormField'
import { LoadingButton } from '../../components/LoadingButton'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'
import { parseApiError } from '../../utils/apiError'
import { isValidGstin, normaliseGstText } from '../../utils/gst'

export function AddCreditClientForm({ pumpId, clients }: { pumpId: number; clients: PumpCreditClient[] }) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()
  const headingId = useId()
  const [name, setName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [gstin, setGstin] = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | undefined>()
  const [phoneError, setPhoneError] = useState<string | undefined>()
  const [gstinError, setGstinError] = useState<string | undefined>()
  const optional = <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span>

  const addMutation = useMutation({
    mutationFn: () => pumpApi.createCreditClient(pumpId, {
      name: name.trim(), phone: phoneNumber.trim(), notes: notes.trim() || undefined,
      gstin: normaliseGstText(gstin) || undefined, billingAddress: billingAddress.trim() || undefined,
    }),
    onSuccess: () => {
      setName(''); setPhoneNumber(''); setNotes(''); setGstin(''); setBillingAddress(''); setError(null)
      qc.invalidateQueries({ queryKey: ['creditClients', pumpId] })
    },
    onError: (err) => setError(parseApiError(err, t('clients.addFailed'))),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null)
    const trimmedName = name.trim()
    if (!/^\d{10}$/.test(phoneNumber.trim())) { setPhoneError(t('clients.phoneInvalid')); return }
    if (clients.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      setNameError(t('clients.duplicateName', { name: trimmedName })); return
    }
    if (!isValidGstin(gstin)) { setGstinError(t('common:gst.gstinFormat')); return }
    addMutation.mutate()
  }

  return (
    <div className={clients.length > 0 ? 'border-t border-border pt-4' : ''}>
      <h3 id={headingId} className="mb-3 text-sm font-semibold text-ink">
        {clients.length === 0 ? t('clients.addFirst') : t('clients.addAnother')}
      </h3>
      <form onSubmit={submit} aria-labelledby={headingId} className="space-y-3">
        <FormGrid>
          <FormField label={t('clients.clientName')} error={nameError}>
            <input required value={name} onChange={e => { setName(e.target.value); setNameError(undefined) }}
              placeholder={t('clients.clientNamePlaceholder')} />
          </FormField>
          <FormField label={t('clientForm.phone')} error={phoneError}>
            <input required value={phoneNumber} type="tel" autoComplete="off"
              onChange={e => { setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10)); setPhoneError(undefined) }}
              placeholder={t('clients.phonePlaceholder')} inputMode="numeric" maxLength={10} />
          </FormField>
          <FormGridFullRow>
            <FormField label={<>{t('common:fields.notes')} {optional}</>}>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('clientForm.notesPlaceholder')} />
            </FormField>
          </FormGridFullRow>
          <FormField label={<>GSTIN {optional}</>} help={t('clientForm.gstinHelp')} error={gstinError}>
            <input value={gstin} onChange={e => { setGstin(e.target.value.toUpperCase()); setGstinError(undefined) }}
              maxLength={15} autoCapitalize="characters" placeholder={t('common:gst.gstinPlaceholder')} />
          </FormField>
          <FormField label={<>{t('clientForm.billingAddress')} {optional}</>} help={t('clientForm.billingAddressHelp')}>
            <input value={billingAddress} onChange={e => setBillingAddress(e.target.value)} maxLength={500} />
          </FormField>
        </FormGrid>
        {error && <p role="alert" className="ui-error-text">{error}</p>}
        <LoadingButton type="submit" isLoading={addMutation.isPending} loadingLabel={t('clients.adding')} className="ui-btn-primary">
          {t('clients.addClient')}
        </LoadingButton>
      </form>
    </div>
  )
}
