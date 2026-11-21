import { useState } from 'react'
import { X } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { parseApiError } from '../../../utils/apiError'
import { pumpApi } from '../../../api/pumpApi'
import type { FuelType } from '../../../types/shift'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { Spinner } from '../../../components/Spinner'
import { useToastStore } from '../../../store/toastStore'
import { IconButton } from '../../../components/IconButton'
import { FUEL_LABELS } from '../../../constants/fuel'
import { ALL_FUEL_TYPES } from '../fuelStyles'

export function CreateDuForm({ pumpId, onCreated }: { pumpId: number; onCreated: () => void }) {
  const { addToast } = useToastStore()
  const [duName, setDuName] = useState('')
  const [duNozzles, setDuNozzles] = useState<Array<{ nozzleNumber: string; fuelType: FuelType | ''; initialReading: string }>>([
    { nozzleNumber: '1', fuelType: '', initialReading: '' },
  ])
  const [addError, setAddError] = useState<string | null>(null)

  const createDUMutation = useMutation({
    mutationFn: (req: { name: string; nozzles: Array<{ nozzleNumber: number; fuelType: FuelType; initialReading?: number }> }) =>
      pumpApi.createDU(pumpId, req),
    onSuccess: () => {
      setDuName('')
      setDuNozzles([{ nozzleNumber: '1', fuelType: '', initialReading: '' }])
      setAddError(null)
      addToast('DU created successfully', 'success')
      onCreated()
    },
    onError: (err) => {
      const msg = parseApiError(err, 'Failed to create DU')
      setAddError(msg)
      addToast(msg, 'error')
    },
  })

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault(); setAddError(null)
    if (!duName.trim()) { setAddError('Enter a DU name.'); return }
    const validNozzles = duNozzles.filter((n) => n.nozzleNumber && n.fuelType)
    if (validNozzles.length === 0) { setAddError('Add at least one nozzle with a fuel type.'); return }
    createDUMutation.mutate({
      name: duName.trim(),
      nozzles: validNozzles.map((n) => ({
        nozzleNumber: Number(n.nozzleNumber),
        fuelType: n.fuelType as FuelType,
        initialReading: n.initialReading ? Number(n.initialReading) : undefined,
      })),
    })
  }

  return (
           <form onSubmit={submitAdd} className="ui-nozzle-form">
             <div className="ui-nozzle-form__hero">
               <div>
                 <p className="ui-section-kicker mb-2">DU Setup</p>
                 <h3 className="ui-title-sm">Add a new Dispensary Unit</h3>
                 <p className="ui-subtitle mt-1">
                   A Dispensary Unit (DU) is a physical MPD machine. Give it a name and add one or more nozzles — each nozzle carries exactly one fuel type.
                 </p>
               </div>
             </div>

             <div className="ui-nozzle-form__section">
               <label className="block">
                 <span className="ui-label">DU Name <span className="text-red-500">*</span></span>
                 <input
                   required
                   type="text"
                   value={duName}
                   onChange={(e) => setDuName(e.target.value)}
                   placeholder="e.g. DU-1, Machine A"
                   className="text-sm"
                 />
               </label>
             </div>

             <div className="ui-nozzle-form__section">
               <div className="ui-nozzle-form__section-head">
                 <div>
                   <span className="ui-label mb-1">Nozzles</span>
                   <p className="ui-help mt-0">Each nozzle has a unique number and exactly one fuel type.</p>
                 </div>
                 <button
                   type="button"
                   onClick={() => setDuNozzles((prev) => [...prev, { nozzleNumber: String(prev.length + 1), fuelType: '', initialReading: '' }])}
                   className="ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs text-blue-600"
                 >
                   + Add nozzle
                 </button>
               </div>

               <div className="space-y-2 mt-2">
                 {duNozzles.map((row, idx) => (
                   <div key={idx} className="flex items-end gap-2 flex-wrap">
                     <div className="w-20">
                       <label className="block">
                         <span className="ui-label mb-1 text-[10px]">Nozzle #</span>
                         <input
                           type="number"
                           min="1"
                           max="20"
                           value={row.nozzleNumber}
                           onChange={(e) => setDuNozzles((prev) => prev.map((r, i) => i === idx ? { ...r, nozzleNumber: e.target.value } : r))}
                           className="text-xs w-full"
                           placeholder="1"
                         />
                       </label>
                     </div>
                     <div className="flex-1">
                       <span className="ui-label mb-1 text-[10px]">Fuel Type</span>
                       <SearchableSelect label="Fuel Type"
                         value={row.fuelType}
                         onChange={(v) => setDuNozzles((prev) => prev.map((r, i) => i === idx ? { ...r, fuelType: v as FuelType } : r))}
                         placeholder="— select —"
                         size="sm"
                         options={ALL_FUEL_TYPES.map((ft) => ({ value: ft, label: FUEL_LABELS[ft] }))}
                       />
                     </div>
                     <div className="flex-1">
                       <label className="block">
                         <span className="ui-label mb-1 text-[10px]">Start Reading</span>
                         <input
                           type="number"
                           step="0.001"
                           min="0"
                           value={row.initialReading}
                           onChange={(e) => setDuNozzles((prev) => prev.map((r, i) => i === idx ? { ...r, initialReading: e.target.value } : r))}
                           placeholder="0"
                           className="text-xs w-full"
                         />
                       </label>
                     </div>
                     {duNozzles.length > 1 && (
                       <IconButton
                         onClick={() => setDuNozzles((prev) => prev.filter((_, i) => i !== idx))}
                         className="text-red-500 hover:text-red-700"
    label="Remove nozzle"
    icon={<X size={12} strokeWidth={2} />}
    />
                     )}
                   </div>
                 ))}
               </div>
             </div>

             {addError && <p role="alert" className="ui-error-text">{addError}</p>}

             <div className="ui-nozzle-form__actions">
               <button type="submit" disabled={createDUMutation.isPending} className="ui-btn ui-btn-primary">
                 {createDUMutation.isPending ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Creating…</span> : 'Create DU'}
               </button>
             </div>
           </form>
  )
}
