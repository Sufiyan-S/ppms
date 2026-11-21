import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { parseApiError } from '../../utils/apiError'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { useToastStore } from '../../store/toastStore'

// ── Pump Settings Content ─────────────────────────────────────────────────────

export function PumpSettingsContent({ pump, onUpdated }: { pump: PumpSummary; onUpdated: () => void }) {
  const { addToast } = useToastStore()
  const [threshold, setThreshold] = useState(pump.discrepancyEscalationThreshold?.toString() ?? '')
  const [error, setError]         = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (val: number | null) =>
      pumpApi.updatePumpSettings(pump.id, { discrepancyEscalationThreshold: val }),
    onSuccess: () => {
      addToast('Settings saved', 'success')
      setError(null)
      onUpdated()
    },
    onError: (err) => setError(parseApiError(err, 'Failed to save settings')),
  })

  const handleSave = () => {
    const val = threshold.trim()
    if (val === '') {
      mutation.mutate(null)
      return
    }
    const num = parseFloat(val)
    if (isNaN(num) || num < 0) {
      setError('Enter a valid positive amount, or leave blank to disable escalation.')
      return
    }
    mutation.mutate(num)
  }

  return (
    <div className="space-y-5 pt-2">
      <div className="ui-alert bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
        When a shift closes with a discrepancy above this amount, only Owner or Admin can resolve it.
        Managers will see it as locked. Leave blank to disable escalation.
      </div>

      <div className="max-w-xs">
        <label className="block">
          <span className="ui-label">Discrepancy Escalation Threshold (₹)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="e.g. 500 — blank to disable"
            className="text-sm"
          />
        </label>
        {error && <p role="alert" className="ui-error-text mt-1">{error}</p>}
      </div>

      <button
        onClick={handleSave}
        disabled={mutation.isPending}
        className="ui-btn ui-btn-primary"
      >
        {mutation.isPending ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  )
}
