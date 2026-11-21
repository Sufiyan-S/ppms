
export function TankerForm({
  name, setName, capacity, setCapacity, tankerType, setTankerType, makeDefault, setMakeDefault, error,
}: {
  name: string; setName: (v: string) => void
  capacity: string; setCapacity: (v: string) => void
  tankerType: 'OWN' | 'COMPANY'; setTankerType: (v: 'OWN' | 'COMPANY') => void
  makeDefault: boolean; setMakeDefault: (v: boolean) => void
  error: string | null
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block">
            <span className="ui-label">Tanker Name</span>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Company Tanker 1"
              className="text-sm"
            />
          </label>
        </div>
        <div className="space-y-1">
          <label className="block">
            <span className="ui-label">Capacity (Litres)</span>
            <input
              type="number"
              min="100"
              step="100"
              value={capacity}
              onChange={e => setCapacity(e.target.value)}
              placeholder="e.g. 12000"
              className="text-sm"
            />
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block">
            <span className="ui-label">Type</span>
            <select
              value={tankerType}
              onChange={e => setTankerType(e.target.value as 'OWN' | 'COMPANY')}
              className="ui-input text-sm"
            >
              <option value="COMPANY">Company Tanker</option>
              <option value="OWN">Own Tanker</option>
            </select>
          </label>
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={e => setMakeDefault(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-slate-700">Set as default</span>
          </label>
        </div>
      </div>
      {error && <p role="alert" className="ui-error-text">{error}</p>}
    </div>
  )
}
