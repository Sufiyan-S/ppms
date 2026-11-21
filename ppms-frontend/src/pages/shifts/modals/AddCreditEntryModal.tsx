import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { shiftApi } from '../../../api/shiftApi'
import { pumpApi } from '../../../api/pumpApi'
import type { Shift, CreditEntryInput } from '../../../types/shift'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { parseApiError } from '../../../utils/apiError'
import { ModalPortal } from '../../../components/ModalPortal'
import { FUEL_LABELS } from '../../../constants/fuel'
import { CreditClientSearch } from '../components/CreditClientSearch'
import { useAuthStore } from '../../../store/authStore'
import { canPerformAction } from '../../../permissions/permissions'
import { IconButton } from '../../../components/IconButton'
import { focusOnMount } from '../../../utils/focus'

// ── Add Credit Entry Modal (mid-shift) ────────────────────────────────────────


export function AddCreditEntryModal({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const qc = useQueryClient()
  const role = useAuthStore((state) => state.user?.role)
  const canVoidEntry = canPerformAction('shift:void-credit-entry', role)
  const { data: creditClients = [] } = useQuery({
    queryKey: ['creditClients', shift.pumpId],
    queryFn: () => pumpApi.getCreditClients(shift.pumpId),
  })

  const [clientSearch,   setClientSearch]   = useState('')
  const [clientName,     setClientName]     = useState('')
  const [clientId,       setClientId]       = useState<number | null>(null)
  const [subAccountId,   setSubAccountId]   = useState<number | null>(null)
  const [showDropdown,   setShowDropdown]   = useState(false)
  const [fuelType,       setFuelType]       = useState<string>(shift.fuelReadings[0]?.fuelType ?? '')
  const [amount,         setAmount]         = useState('')
  const [liters,         setLiters]         = useState('')
  const [inputMode,      setInputMode]      = useState<'amount' | 'liters'>('amount')
  const [billNo,         setBillNo]         = useState('')
  const [description,    setDescription]    = useState('')
  const [error,          setError]          = useState<string | null>(null)

  const priceForFuelType = (ft: string): number | null =>
    shift.fuelReadings.find((r) => r.fuelType === ft)?.priceSnapshot ?? null

  // Void credit entry state
  const [voidTargetId,  setVoidTargetId]   = useState<number | null>(null)
  const [voidReason,    setVoidReason]     = useState('')
  const [voidError,     setVoidError]      = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (entry: CreditEntryInput) => shiftApi.addCreditEntry(shift.pumpId, shift.id, entry),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activeShifts', shift.pumpId] })
      onClose()
    },
    onError: (err: unknown) => setError(parseApiError(err, 'Failed to save credit entry. Please try again.')),
  })

  const voidMutation = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: number; reason: string }) =>
      shiftApi.voidCreditEntry(shift.pumpId, shift.id, entryId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activeShifts', shift.pumpId] })
      setVoidTargetId(null); setVoidReason(''); setVoidError(null)
    },
    onError: (err: unknown) => setVoidError(parseApiError(err, 'Failed to delete entry. Please try again.')),
  })

  const selectedParent = creditClients.find(c => c.id === clientId)
  const subAccounts = selectedParent?.isParent
    ? creditClients.filter(c => c.parentClientId === clientId)
    : []

  const canSave =
    clientName.trim().length > 0 &&
    fuelType.length > 0 &&
    parseFloat(amount) > 0

  const handleSubmit = () => {
    const amt = parseFloat(amount)
    if (!clientName.trim()) { setError('Client name is required'); return }
    if (!fuelType)           { setError('Fuel type is required'); return }
    if (!amount || isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return }
    setError(null)
    mutation.mutate({
      clientId:    subAccountId ?? clientId ?? undefined,
      clientName: clientName.trim(),
      fuelType,
      amount: amt,
      billNo:      billNo.trim() || undefined,
      description: description.trim() || undefined,
    })
  }

  return (
    <ModalPortal onClose={onClose}>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel w-full max-w-md overflow-hidden">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--warning">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Add Credit Entry</h2>
            <p className="ui-modal-subtitle">
              Nozzle {shift.nozzles.map((n) => `#${n.nozzleNumber}`).join(', ')} · {shift.operatorName}
            </p>
          </div>
          <IconButton label="Close" icon="×" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close" />
        </div>

        <div className="ui-modal-body space-y-3">

          {/* Existing credit entries with void option */}
          {shift.creditEntries.length > 0 && (
            <div className="ui-card p-0 overflow-hidden">
              <div className="ui-toolbar px-3 py-2">
                <p className="ui-toolbar-title text-xs">Recorded entries</p>
                {canVoidEntry && <span className="ui-toolbar-note">Click Void to cancel one</span>}
              </div>
              <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                {shift.creditEntries.map((entry) => (
                  <div key={entry.id} className={`flex items-center gap-2 px-3 py-2 ${entry.voidStatus === 'VOIDED' ? 'opacity-40' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{entry.clientName}</p>
                      <p className="text-xs text-slate-500">
                        ₹{entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        {entry.fuelType && ` · ${entry.fuelType}`}
                        {entry.voidStatus === 'VOIDED' && ' · VOIDED'}
                      </p>
                    </div>
                    {canVoidEntry && entry.voidStatus !== 'VOIDED' && voidTargetId !== entry.id && (
                      <button
                        onClick={() => { setVoidTargetId(entry.id); setVoidReason(''); setVoidError(null) }}
                        className="ui-btn ui-btn-ghost min-h-0 shrink-0 border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:border-red-300 hover:text-red-700"
                      >
                        Void
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {/* Void reason input */}
              {voidTargetId !== null && (
                <div className="border-t border-orange-200 bg-orange-50 px-3 py-2">
                  <div className="ui-inline-form space-y-2 border-orange-200 bg-white/70">
                  <input aria-label="Reason for voiding"
                    ref={focusOnMount}
                    type="text"
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    placeholder="Reason for voiding (required)"
                    className="ui-input-compact text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                  {voidError && <p role="alert" className="ui-error-text">{voidError}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => { setVoidTargetId(null); setVoidReason('') }}
                      className="ui-btn ui-btn-secondary min-h-0 flex-1 px-3 py-1 text-xs">
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!voidReason.trim()) { setVoidError('Reason is required'); return }
                        voidMutation.mutate({ entryId: voidTargetId!, reason: voidReason.trim() })
                      }}
                      disabled={voidMutation.isPending}
                      className="ui-btn ui-btn-danger min-h-0 flex-1 px-3 py-1 text-xs disabled:opacity-50">
                      {voidMutation.isPending ? '…' : 'Confirm Void'}
                    </button>
                  </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Client — root/parent accounts only */}
          <CreditClientSearch
            search={clientSearch}
            creditClients={creditClients}
            showDropdown={showDropdown}
            onSearchChange={(text) => {
              setClientSearch(text)
              setClientName(text)
              setClientId(null)
              setSubAccountId(null)
              setShowDropdown(true)
            }}
            onShowDropdownChange={setShowDropdown}
            onSelect={(c) => {
              setClientSearch(c.name)
              setClientName(c.name)
              setClientId(c.id)
              setSubAccountId(null)
              setShowDropdown(false)
            }}
            inputClassName="text-sm"
            placeholder="Search client name…"
          />

          {/* Sub-account picker — shown when selected parent has children */}
          {subAccounts.length > 0 && (
            <div>
              <span className="ui-label">
                Sub-account <span className="text-slate-500 font-normal">(optional)</span>
              </span>
              <SearchableSelect label="Sub-account"
                value={subAccountId != null ? subAccountId.toString() : ''}
                onChange={v => setSubAccountId(v === '' ? null : Number(v))}
                placeholder={`— Bill to parent (${clientName}) —`}
                accentColor="orange"
                options={subAccounts.map(s => ({ value: s.id.toString(), label: s.name }))}
              />
            </div>
          )}

          {/* Fuel + Amount/Liters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="ui-label">
                Fuel <span className="text-red-500">*</span>
              </span>
              <SearchableSelect label="Fuel"
                value={fuelType}
                onChange={v => {
                  setFuelType(v)
                  if (inputMode === 'liters') { setAmount(''); setLiters('') }
                }}
                accentColor="orange"
                options={shift.fuelReadings.map(r => ({
                  value: r.fuelType,
                  label: FUEL_LABELS[r.fuelType] ?? r.fuelType,
                }))}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="ui-label mb-0">
                  {inputMode === 'amount' ? 'Amount (₹)' : 'Liters'}{' '}
                  <span className="text-red-500">*</span>
                </span>
                <div className="flex gap-1 text-xs">
                  <button type="button"
                    onClick={() => { setInputMode('amount'); setLiters('') }}
                    aria-pressed={inputMode === 'amount'}
                    aria-label="Enter amount in rupees"
                    className={`min-h-6 min-w-8 rounded border border-slate-200 px-2 font-medium transition-colors ${inputMode === 'amount' ? 'bg-orange-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                    ₹
                  </button>
                  <button type="button"
                    onClick={() => {
                      const price = priceForFuelType(fuelType)
                      const initLiters = price && amount ? (parseFloat(amount) / price).toFixed(2) : ''
                      setInputMode('liters')
                      setLiters(initLiters)
                    }}
                    disabled={!priceForFuelType(fuelType)}
                    aria-pressed={inputMode === 'liters'}
                    aria-label="Enter litres"
                    className={`min-h-6 min-w-8 rounded border border-slate-200 px-2 font-medium transition-colors ${inputMode === 'liters' ? 'bg-orange-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'} disabled:opacity-40 disabled:cursor-not-allowed`}>
                    L
                  </button>
                </div>
              </div>
              {inputMode === 'amount' ? (
                <>
                  <input aria-label="Credit amount in rupees" type="number" step="0.01" min="0.01" value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="text-sm" />
                  {(() => {
                    const price = priceForFuelType(fuelType)
                    const unit = fuelType === 'CNG' ? 'kg' : 'L'
                    const litersCalc = price && amount ? (parseFloat(amount) / price) : null
                    return litersCalc ? (
                      <p className="text-xs text-slate-500 mt-1">
                        {litersCalc.toFixed(2)} {unit} × ₹{price} = ₹{parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    ) : null
                  })()}
                </>
              ) : (
                <>
                  <input aria-label="Credit quantity" type="number" step="0.001" min="0.001" value={liters}
                    onChange={(e) => {
                      const price = priceForFuelType(fuelType)
                      const amt = price && e.target.value ? (parseFloat(e.target.value) * price).toFixed(2) : ''
                      setLiters(e.target.value)
                      setAmount(amt)
                    }}
                    placeholder="0.00"
                    className="text-sm" />
                  {liters && amount && (() => {
                    const price = priceForFuelType(fuelType)
                    const unit = fuelType === 'CNG' ? 'kg' : 'L'
                    return price ? (
                      <p className="text-xs text-emerald-600 mt-1 font-medium">
                        {parseFloat(liters).toFixed(2)} {unit} × ₹{price} = ₹{parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    ) : null
                  })()}
                </>
              )}
            </div>
          </div>

          {/* Bill No + Description */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block">
                <span className="ui-label">Bill No</span>
                <input type="text" value={billNo} onChange={(e) => setBillNo(e.target.value)}
                  placeholder="e.g. B-101"
                  className="text-sm" />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="ui-label">Description</span>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. given to driver"
                  className="text-sm" />
              </label>
            </div>
          </div>

          {error && (
            <div role="alert" className="ui-alert ui-alert-danger text-sm">{error}</div>
          )}
        </div>

        <div className="ui-modal-footer">
          <button onClick={onClose}
            className="ui-btn ui-btn-secondary flex-1">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!canSave || mutation.isPending}
            className="ui-btn ui-btn-primary flex-1 disabled:bg-slate-300 disabled:text-slate-400 disabled:cursor-not-allowed">
            {mutation.isPending ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
