import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient as PumpCreditClient, UpdateCreditClientRequest } from '../../api/pumpApi'
import { Spinner } from '../../components/Spinner'
import { parseApiError } from '../../utils/apiError'

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
    updateMutation.mutate({ name: editName.trim(), phone: editPhone.trim(), notes: editNotes.trim() || undefined })
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
      {editError && <p role="alert" className="ui-error-text">{editError}</p>}
      <button type="submit" disabled={updateMutation.isPending}
        className="ui-btn ui-btn-primary min-h-0 px-3 py-1.5 text-xs">
        {updateMutation.isPending ? <span className="flex items-center gap-1"><Spinner className="w-3 h-3" />Saving…</span> : 'Save'}
      </button>
    </form>
  )
}
