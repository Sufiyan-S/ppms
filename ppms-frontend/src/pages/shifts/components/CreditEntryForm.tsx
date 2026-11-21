import { X } from 'lucide-react'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { IconButton } from '../../../components/IconButton'
import { onActivateKey } from '../../../utils/keyboard'
import { FUEL_LABELS, FUEL_UNIT } from '../../../constants/fuel'
import type { CreditClient } from '../../../api/pumpApi'
import { CreditClientSearch } from './CreditClientSearch'
import { emptyNum, fmt } from './creditRow'
import type { CreditRow } from './creditRow'

interface Props {
  row: CreditRow
  rowNumber: number
  isExpanded: boolean
  onExpandedChange: (rowId: number | null) => void
  creditClients: CreditClient[]
  availableFuelTypes: string[]
  priceForFuelType: (fuelType: string) => number | null
  onUpdate: <K extends keyof CreditRow>(field: K, value: CreditRow[K]) => void
  onUpdateMulti: (updates: Partial<CreditRow>) => void
  onSelectClient: (clientId: number, clientName: string) => void
  onRemove: () => void
}

export function CreditEntryForm({
  row, rowNumber, isExpanded, onExpandedChange, creditClients, availableFuelTypes, priceForFuelType,
  onUpdate, onUpdateMulti, onSelectClient, onRemove,
}: Props) {
  const isFilled = row.clientName.trim() !== '' && emptyNum(row.amount) > 0
  // Only root (parent/standalone) accounts in the main search
  const selectedParent = creditClients.find(c => c.id === row.clientId)
  const subAccounts = selectedParent?.isParent
    ? creditClients.filter(c => c.parentClientId === row.clientId)
    : []

  return (
    <div key={row.id}>
      {/* ── Collapsed summary row ── */}
      {!isExpanded ? (
        <div
          className="flex items-center justify-between px-4 py-3 hover:bg-orange-50 transition-colors group"
          >
            <div
              className="flex flex-1 items-center gap-3 min-w-0 cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`Edit credit entry ${rowNumber}`}
              onClick={() => onExpandedChange(row.id)}
              onKeyDown={onActivateKey(() => onExpandedChange(row.id))}
            >
            <span className="text-xs font-bold text-orange-700 shrink-0">#{rowNumber}</span>
            {isFilled ? (
              <>
                <span className="text-sm font-medium text-slate-700 truncate">{row.clientName}</span>
                <span className="text-xs text-slate-500 shrink-0">{FUEL_LABELS[row.fuelType] ?? row.fuelType}</span>
                <span className="text-sm font-semibold text-emerald-700 shrink-0">₹{fmt(emptyNum(row.amount))}</span>
                {row.billNo && <span className="text-xs text-slate-500 shrink-0">· {row.billNo}</span>}
              </>
            ) : (
              <span className="text-xs text-slate-500 italic">Incomplete — tap to edit</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className="text-xs text-orange-700 group-hover:text-orange-800 transition-colors">Edit</span>
            <IconButton
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              className="ui-btn-icon text-red-600 hover:text-red-700 transition-colors"
              label="Delete entry"
              icon={<X size={13} strokeWidth={2} />}
            />
          </div>
        </div>
      ) : (
        /* ── Expanded form ── */
        <div className="px-4 py-3 space-y-2.5 bg-orange-50/40">
          {/* Expanded header */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onExpandedChange(null)}
              className="flex items-center gap-1.5 text-xs font-semibold text-orange-700 hover:text-orange-900 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Entry {rowNumber}
            </button>
            <button type="button" onClick={() => onRemove()}
              className="inline-flex items-center gap-1 text-red-400 hover:text-red-600 text-xs transition-colors">
              <X size={12} strokeWidth={2} />Delete
            </button>
          </div>

          {/* Client search — root/parent accounts only */}
          <CreditClientSearch
            search={row.clientSearch}
            creditClients={creditClients}
            showDropdown={row.showDropdown}
            onSearchChange={(text) => onUpdateMulti({ clientSearch: text, clientName: text, clientId: null, showDropdown: true })}
            onShowDropdownChange={(show) => onUpdate('showDropdown', show)}
            onSelect={(c) => onSelectClient(c.id, c.name)}
            inputClassName="ui-search-shell__input text-sm"
            placeholder="Search client name..."
            showNoClientsHint
          />

          {/* Sub-account picker — only shown when the selected parent has children */}
          {subAccounts.length > 0 && (
            <div>
              <span className="ui-label">
                Sub-account <span className="text-slate-500">(optional)</span>
              </span>
              <div role="group" aria-label="Sub-account" className="ui-card p-0 overflow-hidden divide-y divide-slate-50 shadow-none border-slate-200">
                {/* "Bill to parent" option */}
                <button
                  type="button"
                  onClick={() => onUpdateMulti({ subAccountId: null, subAccountName: '' })}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors text-left ${
                    row.subAccountId === null ? 'bg-orange-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    row.subAccountId === null ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {row.clientName.charAt(0).toUpperCase()}
                  </div>
                  <span className={`flex-1 font-medium text-xs ${row.subAccountId === null ? 'text-orange-800' : 'text-slate-500'}`}>
                    Bill to parent ({row.clientName})
                  </span>
                  {row.subAccountId === null && (
                    <svg className="w-3.5 h-3.5 text-orange-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                {/* Sub-account options */}
                {subAccounts.map(s => {
                  const isSelected = row.subAccountId === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onUpdateMulti({ subAccountId: s.id, subAccountName: s.name })}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors text-left ${
                        isSelected ? 'bg-orange-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isSelected ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <span className={`flex-1 font-medium text-sm ${isSelected ? 'text-orange-800' : 'text-slate-700'}`}>
                        {s.name}
                      </span>
                      {s.phone && (
                        <span className="text-xs text-slate-500 shrink-0">{s.phone}</span>
                      )}
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 text-orange-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Fuel type + Amount/Liters */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="ui-label">
                Fuel Type <span className="text-red-500">*</span>
              </span>
              <SearchableSelect label="Fuel Type"
                value={row.fuelType}
                onChange={v => onUpdateMulti({
                  fuelType: v,
                  amount: row.inputMode === 'liters' ? '' : row.amount,
                  liters: '',
                })}
                placeholder="Select…"
                accentColor="orange"
                size="sm"
                options={availableFuelTypes.map(ft => ({
                  value: ft,
                  label: FUEL_LABELS[ft] ?? ft,
                }))}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="ui-label mb-0">
                  {row.inputMode === 'amount' ? 'Amount (₹)' : 'Liters'}{' '}
                  <span className="text-red-500">*</span>
                </span>
                <div className="flex gap-1 text-xs">
                  <button type="button"
                    onClick={() => onUpdateMulti({ inputMode: 'amount', liters: '' })}
                    aria-pressed={row.inputMode === 'amount'}
                    aria-label="Enter amount in rupees"
                    className={`min-h-6 min-w-8 rounded border border-slate-200 px-2 font-medium transition-colors ${row.inputMode === 'amount' ? 'bg-orange-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                    ₹
                  </button>
                  <button type="button"
                    onClick={() => {
                      const price = priceForFuelType(row.fuelType)
                      const initLiters = price && row.amount
                        ? (parseFloat(row.amount) / price).toFixed(2)
                        : ''
                      onUpdateMulti({ inputMode: 'liters', liters: initLiters })
                    }}
                    disabled={!priceForFuelType(row.fuelType)}
                    aria-pressed={row.inputMode === 'liters'}
                    aria-label="Enter litres"
                    className={`min-h-6 min-w-8 rounded border border-slate-200 px-2 font-medium transition-colors ${row.inputMode === 'liters' ? 'bg-orange-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'} disabled:opacity-40 disabled:cursor-not-allowed`}>
                    L
                  </button>
                </div>
              </div>
              {row.inputMode === 'amount' ? (
                <>
                  <input aria-label="Credit amount in rupees" type="number" step="0.01" min="0.01" value={row.amount}
                    onChange={(e) => onUpdate('amount', e.target.value)}
                    placeholder="0.00"
                    className="ui-input-compact focus:outline-none focus:ring-1 focus:ring-orange-400" />
                  {(() => {
                    const price = priceForFuelType(row.fuelType)
                    const unit = FUEL_UNIT[row.fuelType] ?? 'L'
                    const litersCalc = price && row.amount ? (parseFloat(row.amount) / price) : null
                    return litersCalc ? (
                      <p className="text-xs text-slate-500 mt-1">
                        {litersCalc.toFixed(2)} {unit} × ₹{price} = ₹{parseFloat(row.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    ) : null
                  })()}
                </>
              ) : (
                <>
                  <input aria-label="Credit quantity" type="number" step="0.001" min="0.001" value={row.liters}
                    onChange={(e) => {
                      const price = priceForFuelType(row.fuelType)
                      const raw = parseFloat(e.target.value)
                      const amt = price && isFinite(raw) && raw >= 0 && raw <= 99_999
                        ? (raw * price).toFixed(2)
                        : ''
                      onUpdateMulti({ liters: e.target.value, amount: amt })
                    }}
                    placeholder="0.00"
                    className="ui-input-compact focus:outline-none focus:ring-1 focus:ring-orange-400" />
                  {row.liters && row.amount && (() => {
                    const price = priceForFuelType(row.fuelType)
                    const unit = FUEL_UNIT[row.fuelType] ?? 'L'
                    return price ? (
                      <p className="text-xs text-emerald-600 mt-1 font-medium">
                        {parseFloat(row.liters).toFixed(2)} {unit} × ₹{price} = ₹{parseFloat(row.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    ) : null
                  })()}
                </>
              )}
            </div>
          </div>

          {/* Bill No + Description */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block">
                <span className="ui-label">Bill No</span>
                <input type="text" value={row.billNo}
                  onChange={(e) => onUpdate('billNo', e.target.value)}
                  placeholder="e.g. B-101"
                  className="ui-input-compact focus:outline-none focus:ring-1 focus:ring-orange-400" />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="ui-label">Description</span>
                <input type="text" value={row.description}
                  onChange={(e) => onUpdate('description', e.target.value)}
                  placeholder="e.g. given to driver"
                  className="ui-input-compact focus:outline-none focus:ring-1 focus:ring-orange-400" />
              </label>
            </div>
          </div>

          {/* Add / Cancel actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onRemove()}
              className="ui-btn ui-btn-ghost text-xs px-3 py-1.5 min-h-0"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!row.clientId || emptyNum(row.amount) <= 0) return
                onExpandedChange(null)
              }}
              disabled={!row.clientId || emptyNum(row.amount) <= 0}
              className="ui-btn ui-btn-warning text-xs px-3 py-1.5 min-h-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
