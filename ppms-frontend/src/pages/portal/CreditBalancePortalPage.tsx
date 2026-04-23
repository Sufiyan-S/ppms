import { useState } from 'react'
import axios from 'axios'
import { Fuel } from 'lucide-react'

// Uses a plain axios instance — no auth header, no JWT
const publicClient = axios.create({ baseURL: '/api' })

interface BalanceResult {
  clientName: string
  outstandingAmount: number
  creditLimit: number
}

function fmtAmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function CreditBalancePortalPage() {
  const [pumpId, setPumpId]   = useState('')
  const [phone, setPhone]     = useState('')
  const [result, setResult]   = useState<BalanceResult | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pumpId.trim() || !phone.trim()) {
      setError('Both Pump ID and phone number are required')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await publicClient.get('/public/credit-balance', {
        params: { pumpId: parseInt(pumpId), phone: phone.trim() },
      })
      setResult(res.data)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Account not found. Please check your pump ID and phone number.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">

      <div className="ui-card w-full max-w-sm p-0 overflow-hidden shadow-lg">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 px-6 py-5 text-white text-center">
          <div className="flex justify-center mb-2"><Fuel size={28} strokeWidth={1.8} className="text-blue-200" /></div>
          <h1 className="text-lg font-bold">Credit Balance Portal</h1>
          <p className="text-blue-200 text-xs mt-1">Check your outstanding fuel credit balance</p>
        </div>

        {/* Form */}
        <div className="px-6 py-5">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="ui-label">Pump ID</label>
              <input
                type="number"
                min="1"
                value={pumpId}
                onChange={e => setPumpId(e.target.value)}
                className="text-sm"
                placeholder="e.g. 1"
                required
              />
              <p className="text-xs text-slate-400 mt-0.5">Ask the pump manager for the Pump ID</p>
            </div>

            <div>
              <label className="ui-label">Registered Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="text-sm"
                placeholder="10-digit mobile number"
                required
              />
            </div>

            {error && (
              <div className="ui-alert ui-alert-danger text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="ui-btn ui-btn-primary w-full disabled:opacity-50"
            >
              {loading ? 'Checking…' : 'Check Balance'}
            </button>
          </form>

          {/* Result card */}
          {result && (
            <div className="mt-4 ui-card-plain ui-card-muted px-4 py-4">
              <p className="text-xs text-slate-500 mb-2">Account found for</p>
              <p className="text-base font-bold text-slate-800 mb-3">{result.clientName}</p>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Outstanding Balance</span>
                  <span className={`text-sm font-bold ${result.outstandingAmount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {fmtAmt(result.outstandingAmount)}
                  </span>
                </div>
                {result.creditLimit > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Credit Limit</span>
                    <span className="text-sm text-slate-700">{fmtAmt(result.creditLimit)}</span>
                  </div>
                )}
              </div>

              {result.outstandingAmount <= 0 && (
                <p className="text-xs text-emerald-600 font-medium mt-2">Your account is fully settled.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">
            Powered by PPMS — Petrol Pump Management System
          </p>
        </div>
      </div>
    </div>
  )
}
