import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient as PumpCreditClient, UpdateCreditClientRequest } from '../../api/pumpApi'
import { FormField } from '../../components/FormField'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'
import { LoadingButton } from '../../components/LoadingButton'
import { parseApiError } from '../../utils/apiError'
import { isValidGstin, normaliseGstText } from '../../utils/gst'

interface EditCreditClientFormProps {
  pumpId: number
  client: PumpCreditClient
  indent?: boolean
  onSaved: () => void
}

export function EditCreditClientForm({ pumpId, client, indent = false, onSaved }: EditCreditClientFormProps) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()
  const [editName, setEditName]   = useState(client.name)
  const [editPhone, setEditPhone] = useState(client.phone ?? '')
  const [editNotes, setEditNotes] = useState(client.notes ?? '')
  const [editGstin, setEditGstin] = useState(client.gstin ?? '')
  const [editBillingAddress, setEditBillingAddress] = useState(client.billingAddress ?? '')
  const [phoneError, setPhoneError] = useState<string | undefined>()
  const [gstinError, setGstinError] = useState<string | undefined>()
  const [editError, setEditError] = useState<string | null>(null)
  const optional = <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span>

  const updateMutation = useMutation({
    mutationFn: (req: UpdateCreditClientRequest) => pumpApi.updateCreditClient(pumpId, client.id, req),
    onSuccess: () => {
      setEditError(null)
      qc.invalidateQueries({ queryKey: ['creditClients', pumpId] })
      onSaved()
    },
    onError: (err) => setEditError(parseApiError(err, t('clientForm.updateFailed'))),
  })

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault(); setEditError(null)
    if (!/^\d{10}$/.test(editPhone.trim())) { setPhoneError(t('clientForm.phoneInvalid')); return }
    setPhoneError(undefined)
    if (!isValidGstin(editGstin)) { setGstinError(t('common:gst.gstinFormat')); return }
    setGstinError(undefined)
    updateMutation.mutate({
      name: editName.trim(), phone: editPhone.trim(), notes: editNotes.trim() || undefined,
      gstin: normaliseGstText(editGstin), billingAddress: editBillingAddress.trim(),
    })
  }

  return (
    <form onSubmit={submitEdit}
      className={`${indent ? 'pl-7 pr-3' : 'px-3'} space-y-3 border-t border-border bg-surface py-3`}>
      <FormGrid>
        <FormField label={t('clientForm.name')}>
          <input required value={editName} onChange={e => setEditName(e.target.value)} />
        </FormField>
        <FormField label={t('clientForm.phone')} error={phoneError}>
          <input required value={editPhone} type="tel" autoComplete="off"
            onChange={e => { setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setPhoneError(undefined) }}
            inputMode="numeric" maxLength={10} />
        </FormField>
        <FormGridFullRow>
          <FormField label={<>{t('common:fields.notes')} {optional}</>}>
            <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder={t('clientForm.notesPlaceholder')} />
          </FormField>
        </FormGridFullRow>
        <FormField label={<>GSTIN {optional}</>} help={t('clientForm.gstinHelp')} error={gstinError}>
          <input value={editGstin} onChange={e => { setEditGstin(e.target.value.toUpperCase()); setGstinError(undefined) }}
            maxLength={15} autoCapitalize="characters" placeholder={t('common:gst.gstinPlaceholder')} />
        </FormField>
        <FormField label={<>{t('clientForm.billingAddress')} {optional}</>} help={t('clientForm.billingAddressHelp')}>
          <input value={editBillingAddress} onChange={e => setEditBillingAddress(e.target.value)} maxLength={500} />
        </FormField>
      </FormGrid>
      {editError && <p role="alert" className="ui-error-text">{editError}</p>}
      <LoadingButton type="submit" isLoading={updateMutation.isPending} loadingLabel={t('common:actions.saving')}
        className="ui-btn-primary">
        {t('common:actions.save')}
      </LoadingButton>
    </form>
  )
}
