import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient as PumpCreditClient, UpdateCreditClientRequest } from '../../api/pumpApi'
import { Spinner } from '../../components/Spinner'
import { parseApiError } from '../../utils/apiError'
import { GSTIN_FORMAT_MESSAGE, isValidGstin, normaliseGstText } from '../../utils/gst'

interface EditCreditClientFormProps {
  pumpId: number
  client: PumpCreditClient
  indent?: boolean
  onSaved: () => void
}

export function EditCreditClientForm({ pumpId, client, indent = false, onSaved }: EditCreditClientFormProps) {
  const qc = useQueryClient()
  const [editName, setEditName]   = useState(client.name)
  const [editPhone, setEditPhone] = useState(client.phone ?? '')
  const [editNotes, setEditNotes] = useState(client.notes ?? '')
  const [editGstin, setEditGstin] = useState(client.gstin ?? '')
  const [editBillingAddress, setEditBillingAddress] = useState(client.billingAddress ?? '')
  const [editError, setEditError] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: (req: UpdateCreditClientRequest) => pumpApi.updateCreditClient(pumpId, client.id, req),
    onSuccess: () => {
      setEditError(null)
      qc.invalidateQueries({ queryKey: ['creditClients', pumpId] })
      onSaved()
    },
    onError: (err) => setEditError(parseApiError(err, 'Failed to update client')),
  })

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault(); setEditError(null)
    if (!/^\d{10}$/.test(editPhone.trim())) { setEditError('Phone must be exactly 10 digits.'); return }
    if (!isValidGstin(editGstin)) { setEditError(GSTIN_FORMAT_MESSAGE); return }
    updateMutation.mutate({
      name: editName.trim(), phone: editPhone.trim(), notes: editNotes.trim() || undefined,
      gstin: normaliseGstText(editGstin), billingAddress: editBillingAddress.trim(),
    })
  }

  return (
    <form onSubmit={submitEdit}
      className={`${indent ? 'pl-7 pr-3' : 'px-3'} py-3 border-t border-slate-100 bg-white space-y-2`}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block">
            <span className="ui-label">Name <span className="text-red-500">*</span></span>
            <input required value={editName} onChange={e => setEditName(e.target.value)} className="text-xs min-h-10" />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="ui-label">Phone <span className="text-red-500">*</span></span>
            <input required value={editPhone}
              onChange={e => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              inputMode="numeric" maxLength={10} className="text-xs min-h-10" />
          </label>
        </div>
      </div>
      <div>
        <label className="block">
          <span className="ui-label">Notes <span className="text-slate-500">(optional)</span></span>
          <input value={editNotes} onChange={e => setEditNotes(e.target.value)}
            placeholder="e.g. Fleet manager, lorry owner" className="text-xs min-h-10" />
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="ui-label">GSTIN <span className="text-slate-500">(blank if unregistered)</span></span>
          <input value={editGstin} onChange={e => setEditGstin(e.target.value.toUpperCase())}
            maxLength={15} autoCapitalize="characters" placeholder="e.g. 27ABCDE1234F1Z5" className="text-xs min-h-10" />
        </label>
        <label className="block">
          <span className="ui-label">Billing address <span className="text-slate-500">(optional)</span></span>
          <input value={editBillingAddress} onChange={e => setEditBillingAddress(e.target.value)}
            maxLength={500} placeholder="Printed on invoices" className="text-xs min-h-10" />
        </label>
      </div>
      {editError && <p role="alert" className="ui-error-text">{editError}</p>}
      <button type="submit" disabled={updateMutation.isPending}
        className="ui-btn ui-btn-primary min-h-0 px-3 py-1.5 text-xs">
        {updateMutation.isPending ? <span className="flex items-center gap-1"><Spinner className="w-3 h-3" />Saving…</span> : 'Save'}
      </button>
    </form>
  )
}
