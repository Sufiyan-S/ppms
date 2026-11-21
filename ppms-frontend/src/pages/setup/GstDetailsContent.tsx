import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { parseApiError } from '../../utils/apiError'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { useToastStore } from '../../store/toastStore'
import { GSTIN_FORMAT_MESSAGE, isValidGstin, isValidInvoicePrefix, normaliseGstText } from '../../utils/gst'

// ── GST details used on credit invoices ──────────────────────────────────────

export function GstDetailsContent({ pump, onUpdated }: { pump: PumpSummary; onUpdated: () => void }) {
  const { addToast } = useToastStore()
  const [gstin, setGstin]                 = useState(pump.gstin ?? '')
  const [legalName, setLegalName]         = useState(pump.legalName ?? '')
  const [stateName, setStateName]         = useState(pump.stateName ?? '')
  const [invoicePrefix, setInvoicePrefix] = useState(pump.invoicePrefix ?? '')
  const [error, setError]                 = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => pumpApi.updatePumpSettings(pump.id, {
      gstin: normaliseGstText(gstin),
      legalName: legalName.trim(),
      stateName: stateName.trim(),
      invoicePrefix: normaliseGstText(invoicePrefix),
    }),
    onSuccess: () => {
      addToast('GST details saved', 'success')
      setError(null)
      onUpdated()
    },
    onError: (err) => setError(parseApiError(err, 'Failed to save GST details')),
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValidGstin(gstin)) { setError(GSTIN_FORMAT_MESSAGE); return }
    if (!isValidInvoicePrefix(invoicePrefix)) { setError('Invoice prefix must be 1 to 5 letters or digits.'); return }
    setError(null)
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 pt-2">
      <div className="ui-alert bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-800">
        Needed before you can issue tax invoices to credit clients. Invoice numbers look like
        {' '}<strong>{(normaliseGstText(invoicePrefix) || 'PMP3')}/26-27/0001</strong> and restart every April.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="ui-label">GSTIN</span>
          <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())}
            maxLength={15} autoCapitalize="characters" placeholder="e.g. 27ABCDE1234F1Z5" className="text-sm" />
        </label>
        <label className="block">
          <span className="ui-label">Legal name (as registered)</span>
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)}
            maxLength={150} placeholder="e.g. Lakshmi Fuels Pvt Ltd" className="text-sm" />
        </label>
        <label className="block">
          <span className="ui-label">State</span>
          <input value={stateName} onChange={(e) => setStateName(e.target.value)}
            maxLength={60} placeholder="e.g. Maharashtra" className="text-sm" />
        </label>
        <label className="block">
          <span className="ui-label">Invoice prefix</span>
          <input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
            maxLength={5} autoCapitalize="characters" placeholder="e.g. PMP3" className="text-sm" />
        </label>
      </div>

      {error && <p role="alert" className="ui-error-text">{error}</p>}

      <button type="submit" disabled={mutation.isPending} className="ui-btn ui-btn-primary">
        {mutation.isPending ? 'Saving…' : 'Save GST Details'}
      </button>
    </form>
  )
}
