import { X } from 'lucide-react'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { IconButton } from '../../../components/IconButton'
import { FUEL_LABELS } from '../../../constants/fuel'
import { SectionLabel } from './SectionLabel'
import { fmt } from './backfillHelpers'
import type { BackfillForm } from './useBackfillForm'

export function CreditSalesSection({ form }: { form: BackfillForm }) {
  const { creditRows, expandedCreditId, setExpandedCreditId, creditClients, creditClientOptions, creditNum, addCreditRow, removeCreditRow, updateCreditRow } = form
  return (
                 <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-4 space-y-3">
                   <SectionLabel>Credit Sales</SectionLabel>

                   <div className="flex items-center justify-between text-xs text-slate-600">
                     <span>Credit total (sum of entries below)</span>
                     <span className="font-semibold text-slate-800">₹{fmt(creditNum)}</span>
                   </div>

                   {creditRows.map((row) => {
                     const isExpanded = expandedCreditId === row._key
                     return (
                       <div key={row._key} className="bg-white rounded-lg border border-orange-200 overflow-hidden">
                         {!isExpanded ? (
                           <div className="flex items-center justify-between px-3 py-2 text-xs">
                             <span className="font-medium text-slate-700 truncate">
                               {row.clientName || 'New entry'}{row.amount ? ` · ₹${row.amount}` : ''}
                             </span>
                             <div className="flex items-center gap-2 shrink-0 ml-2">
                               <button type="button" onClick={() => setExpandedCreditId(row._key)}
                                 className="text-blue-600 hover:underline">Edit</button>
                               <IconButton onClick={() => removeCreditRow(row._key)}
                                 className="text-red-500 hover:text-red-700"
    label="Remove credit entry"
    icon={<X size={13} strokeWidth={2} />}
    />
                             </div>
                           </div>
                         ) : (
                           <div className="p-3 space-y-2">
                             <div className="grid grid-cols-2 gap-2">
                               <div>
                                 <span id={`backfill-credit-client-${row._key}`} className="ui-label text-xs">Client <span className="text-red-500">*</span></span>
                                 <SearchableSelect
                                   aria-labelledby={`backfill-credit-client-${row._key}`}
                                   value={row.clientId ? String(row.clientId) : ''}
                                   onChange={(value) => {
                                     const client = creditClients.find(c => c.id === Number(value))
                                     updateCreditRow(row._key, { clientId: client?.id ?? null, clientName: client?.name ?? '' })
                                   }}
                                   options={creditClientOptions}
                                   placeholder="Select client"
                                   accentColor="orange"
                                   size="sm"
                                 />
                               </div>
                               <div>
                                 <label className="block">
                                   <span className="ui-label text-xs">Amount (₹) <span className="text-red-500">*</span></span>
                                   <input type="number" min="0.01" step="0.01" placeholder="0.00" value={row.amount}
                                     onChange={(e) => updateCreditRow(row._key, { amount: e.target.value })}
                                     className="ui-input" />
                                 </label>
                               </div>
                             </div>
                             <div className="grid grid-cols-2 gap-2">
                               <div>
                                 <label className="block">
                                   <span className="ui-label text-xs">Fuel Type</span>
                                   <select value={row.fuelType}
                                     onChange={(e) => updateCreditRow(row._key, { fuelType: e.target.value })}
                                     className="ui-input">
                                     <option value="">— optional —</option>
                                     {Object.entries(FUEL_LABELS).map(([k, v]) => (
                                       <option key={k} value={k}>{v}</option>
                                     ))}
                                   </select>
                                 </label>
                               </div>
                               <div>
                                 <label className="block">
                                   <span className="ui-label text-xs">Bill No.</span>
                                   <input type="text" placeholder="optional" value={row.billNo}
                                     onChange={(e) => updateCreditRow(row._key, { billNo: e.target.value })}
                                     className="ui-input" />
                                 </label>
                               </div>
                             </div>
                             <div>
                               <label className="block">
                                 <span className="ui-label text-xs">Description</span>
                                 <input type="text" placeholder="optional" value={row.description}
                                   onChange={(e) => updateCreditRow(row._key, { description: e.target.value })}
                                   className="ui-input" />
                               </label>
                             </div>
                             <div className="flex items-center justify-between pt-1">
                               <button type="button" onClick={() => removeCreditRow(row._key)}
                                 className="text-xs text-red-500 hover:text-red-700">Remove entry</button>
                               <button
                                 type="button"
                                 disabled={!row.clientId || !row.amount}
                                 onClick={() => setExpandedCreditId(null)}
                                 className="ui-btn ui-btn-primary min-h-0 px-3 py-1 text-xs disabled:opacity-40"
                               >Done</button>
                             </div>
                           </div>
                         )}
                       </div>
                     )
                   })}

                   <button type="button" onClick={addCreditRow}
                     className="w-full border border-dashed border-orange-300 rounded-lg py-2 text-xs text-orange-600 hover:border-orange-400 hover:bg-orange-100/50 transition-colors">
                     + Add Credit Entry
                   </button>
                 </div>
  )
}
