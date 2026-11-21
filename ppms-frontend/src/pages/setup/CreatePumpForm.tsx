import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { parseApiError } from '../../utils/apiError'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'

// ── Create pump form ──────────────────────────────────────────────────────────

export function CreatePumpForm({ onCreated }: { onCreated: (p: PumpSummary) => void }) {
  const { addToast } = useToastStore()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [maxDUs, setMaxDUs] = useState('4')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: pumpApi.createPump,
    onSuccess: (pump) => {
      setName('')
      setAddress('')
      setMaxDUs('4')
      setError(null)
      addToast(`Pump "${pump.name}" created`, 'success')
      onCreated(pump)
    },
    onError: (err) => {
      const msg = parseApiError(err, 'Failed to create pump')
      setError(msg)
      addToast(msg, 'error')
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    mutation.mutate({ name, address, maxDuCount: Number(maxDUs) })
  }

  return (
    <form onSubmit={submit} className="space-y-3 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block">
            <span className="ui-label">Pump Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Road Pump"
              className="text-sm"
            />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="ui-label">Max DUs</span>
            <input
              required
              type="number"
              min="1"
              max="20"
              value={maxDUs}
              onChange={(e) => setMaxDUs(e.target.value)}
              className="text-sm"
            />
          </label>
        </div>
      </div>
      <div>
        <label className="block">
          <span className="ui-label">Address</span>
          <input
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. 123, MG Road, Bangalore"
            className="text-sm"
          />
        </label>
      </div>
      {error && <p role="alert" className="ui-error-text">{error}</p>}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="ui-btn ui-btn-primary"
      >
        {mutation.isPending
        ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Creating…</span>
        : 'Create Pump'}
      </button>
    </form>
  )
}
