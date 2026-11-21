import { useNavigate } from 'react-router-dom'
import type { CreditClient } from '../../../api/pumpApi'
import { maskPhone } from '../../../utils/maskPhone'

interface Props {
  search: string
  creditClients: CreditClient[]
  showDropdown: boolean
  onSearchChange: (text: string) => void
  onShowDropdownChange: (show: boolean) => void
  onSelect: (client: CreditClient) => void
  inputClassName: string
  placeholder: string
  showNoClientsHint?: boolean
}

export function CreditClientSearch({
  search, creditClients, showDropdown, onSearchChange, onShowDropdownChange, onSelect,
  inputClassName, placeholder, showNoClientsHint = false,
}: Props) {
  const navigate = useNavigate()
  // Only root (parent/standalone) accounts in the main search
  const rootClients = creditClients.filter(c => c.parentClientId === null)
  const filtered = rootClients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="ui-search-shell">
      <label className="block">
        <span className="ui-label">
        Client <span className="text-red-500">*</span>
      </span>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => onShowDropdownChange(true)}
          onBlur={() => setTimeout(() => onShowDropdownChange(false), 150)}
          placeholder={placeholder}
          className={inputClassName}
        />
      </label>
      {showDropdown && rootClients.length > 0 && (
        <div className="ui-card absolute top-full left-0 right-0 z-50 mt-0.5 max-h-36 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <button
              type="button"
              onMouseDown={() => navigate('/dashboard/credit?tab=clients')}
              className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50 flex items-center justify-between gap-2"
            >
              <span className="text-slate-500 text-xs truncate">
                No match{search.trim() ? ` for "${search.trim()}"` : ''}
              </span>
              <span className="text-xs text-blue-600 font-medium shrink-0">+ Add client →</span>
            </button>
          ) : (
            filtered.map((c) => (
              <button key={c.id} type="button"
                onMouseDown={() => onSelect(c)}
                className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-orange-50 flex items-center justify-between">
                <span className="font-medium text-slate-700">{c.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {c.isParent && (
                    <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                      has sub-accounts
                    </span>
                  )}
                  {c.phone && <span className="text-xs text-slate-500">{maskPhone(c.phone)}</span>}
                </div>
              </button>
            ))
          )}
        </div>
      )}
      {showNoClientsHint && creditClients.length === 0 && (
        <p className="text-xs text-amber-600 mt-1">
          No clients added yet — Owner can add them in Setup.
        </p>
      )}
    </div>
  )
}
