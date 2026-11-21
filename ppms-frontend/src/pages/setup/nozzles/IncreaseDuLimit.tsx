import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { parseApiError } from '../../../utils/apiError'
import { pumpApi } from '../../../api/pumpApi'
import type { PumpSummary } from '../../../api/pumpApi'
import { Spinner } from '../../../components/Spinner'
import { useToastStore } from '../../../store/toastStore'

export function IncreaseDuLimit({ pump, onUpdated }: { pump: PumpSummary; onUpdated: () => void }) {
  const { addToast } = useToastStore()
  const [showIncreaseMax, setShowIncreaseMax] = useState(false)
  const [newMaxCount, setNewMaxCount] = useState('')
  const [increaseError, setIncreaseError] = useState<string | null>(null)

  const increaseMaxMutation = useMutation({
    mutationFn: (count: number) => pumpApi.updateMaxDuCount(pump.id, count),
    onSuccess: () => {
      setShowIncreaseMax(false); setNewMaxCount(''); setIncreaseError(null)
      addToast('DU limit updated', 'success')
      onUpdated()
    },
    onError: (err) => { const msg = parseApiError(err, 'Failed to update DU limit'); setIncreaseError(msg); addToast(msg, 'error') },
  })

  return (
    <div className="space-y-2">
      <p className="ui-alert ui-alert-warning text-xs">
        Maximum DU count ({pump.maxDuCount}) reached.
        {' '}If you have added a new machine, you can increase the limit below.
      </p>
      {!showIncreaseMax ? (
        <button
          type="button"
          onClick={() => { setShowIncreaseMax(true); setNewMaxCount(String(pump.maxDuCount + 1)) }}
          className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800"
        >
          + Increase DU limit
        </button>
      ) : (
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block">
              <span className="ui-label">New maximum DU count</span>
              <input
                type="number"
                min={pump.maxDuCount + 1}
                max="20"
                value={newMaxCount}
                onChange={(e) => setNewMaxCount(e.target.value)}
                className="w-24 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => increaseMaxMutation.mutate(Number(newMaxCount))}
            disabled={increaseMaxMutation.isPending || !newMaxCount}
            className="ui-btn ui-btn-primary"
          >
            {increaseMaxMutation.isPending ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Saving…</span> : 'Increase Limit'}
          </button>
          <button
            type="button"
            onClick={() => { setShowIncreaseMax(false); setIncreaseError(null) }}
            className="ui-btn ui-btn-ghost text-xs"
          >
            Cancel
          </button>
          {increaseError && <p role="alert" className="ui-error-text w-full">{increaseError}</p>}
        </div>
      )}
    </div>
  )
}
