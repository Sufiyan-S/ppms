import { useState, useDeferredValue } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient as PumpCreditClient } from '../../api/pumpApi'
import { SkeletonRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { Spinner } from '../../components/Spinner'
import { parseApiError } from '../../utils/apiError'
import { onActivateKey } from '../../utils/keyboard'
import { EditCreditClientForm } from './EditCreditClientForm'
import { PortalPinControl } from './PortalPinControl'

// ─── Credit Clients Tab ───────────────────────────────────────────────────────

interface CreditClientsTabProps {
  pumpId: number
  canManageClients: boolean
  canManagePortalPins: boolean
}

export function CreditClientsTab({ pumpId, canManageClients, canManagePortalPins }: CreditClientsTabProps) {
  const qc = useQueryClient()

  const [name, setName]               = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [notes, setNotes]             = useState('')
  const [addError, setAddError]       = useState<string | null>(null)

  const [editingId, setEditingId]     = useState<number | null>(null)

  const [clientSearch,     setClientSearch]     = useState('')
  const deferredSearch = useDeferredValue(clientSearch)

  const [expandedParentId, setExpandedParentId] = useState<number | null>(null)
  const toggleCollapse = (id: number) =>
    setExpandedParentId(prev => prev === id ? null : id)

  const [addSubParentId, setAddSubParentId] = useState<number | null>(null)
  const [addSubName,     setAddSubName]     = useState('')
  const [addSubPhone,    setAddSubPhone]    = useState('')
  const [addSubNotes,    setAddSubNotes]    = useState('')
  const [addSubError,    setAddSubError]    = useState<string | null>(null)

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['creditClients', pumpId],
    queryFn:  () => pumpApi.getCreditClients(pumpId),
  })

  const addMutation = useMutation({
    mutationFn: (req: { name: string; phone?: string; notes?: string; parentClientId?: number }) =>
      pumpApi.createCreditClient(pumpId, req),
    onSuccess: () => {
      setName(''); setPhoneNumber(''); setNotes(''); setAddError(null)
      setAddSubName(''); setAddSubPhone(''); setAddSubNotes(''); setAddSubError(null); setAddSubParentId(null)
      qc.invalidateQueries({ queryKey: ['creditClients', pumpId] })
    },
    onError: (err, variables) => {
      const msg = parseApiError(err, 'Failed to add client')
      if (variables.parentClientId != null) setAddSubError(msg)
      else setAddError(msg)
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: ({ clientId, isActive }: { clientId: number; isActive: boolean }) =>
      pumpApi.toggleCreditClientStatus(pumpId, clientId, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['creditClients', pumpId] }),
    onError: (err) => setAddError(parseApiError(err, 'Failed to update client status')),
  })

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault(); setAddError(null)
    const trimmedName = name.trim(); const trimmedPhone = phoneNumber.trim()
    if (!/^\d{10}$/.test(trimmedPhone)) { setAddError('Phone number must be exactly 10 digits.'); return }
    if (clients.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      setAddError(`A client named "${trimmedName}" already exists.`); return
    }
    addMutation.mutate({ name: trimmedName, phone: trimmedPhone, notes: notes.trim() || undefined })
  }

  const submitAddSub = (e: React.FormEvent, parentId: number) => {
    e.preventDefault(); setAddSubError(null)
    const trimmedName = addSubName.trim(); const trimmedPhone = addSubPhone.trim()
    if (!/^\d{10}$/.test(trimmedPhone)) { setAddSubError('Phone number must be exactly 10 digits.'); return }
    if (clients.some(c => c.parentClientId === parentId && c.name.toLowerCase() === trimmedName.toLowerCase())) {
      setAddSubError(`A sub-account named "${trimmedName}" already exists under this parent.`); return
    }
    addMutation.mutate({ name: trimmedName, phone: trimmedPhone, notes: addSubNotes.trim() || undefined, parentClientId: parentId })
  }

  // Active clients first, disabled clients at bottom — each group sorted by name
  const rootClients = clients
    .filter(c => c.parentClientId === null)
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  const childrenByParent = clients.reduce<Record<number, PumpCreditClient[]>>((acc, c) => {
    if (c.parentClientId !== null) {
      acc[c.parentClientId] = [...(acc[c.parentClientId] ?? []), c]
    }
    return acc
  }, {})

  const q = deferredSearch.toLowerCase().trim()
  const matchesQuery = (c: PumpCreditClient) =>
    c.name.toLowerCase().includes(q) ||
    (c.phone ?? '').includes(q) ||
    (c.notes ?? '').toLowerCase().includes(q)

  const filteredRootClients = q
    ? rootClients.filter(parent =>
        matchesQuery(parent) || (childrenByParent[parent.id] ?? []).some(matchesQuery)
      )
    : rootClients

  if (isLoading) return <div className="px-5 py-4"><SkeletonRows count={4} /></div>

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Parties who take fuel on credit. Operators pick from this list when closing a shift.
        {canManageClients ? ' Disabled clients are hidden from shift dropdowns. Client records are never deleted.' : ''}
      </p>

      {rootClients.length > 0 && (
        <div className="ui-search-shell">
          <svg className="ui-search-shell__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input aria-label="Search clients"
            type="text"
            className="ui-search-shell__input"
            placeholder="Search client or sub-account…"
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
          />
          {clientSearch && (
            <button
              type="button"
              onClick={() => setClientSearch('')}
              className="ui-search-shell__clear"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      )}

      {filteredRootClients.length > 0 ? (
        <div className="space-y-3">
          {filteredRootClients.map(parent => {
            const children    = childrenByParent[parent.id] ?? []
            const hasChildren = children.length > 0
            const childHasMatch = q ? children.some(matchesQuery) : false
            const isExpanded  = q ? childHasMatch : expandedParentId === parent.id
            return (
              <div key={parent.id} className="ui-card p-0 overflow-hidden">
                <div
                  className={`ui-accordion-trigger ${hasChildren ? 'select-none' : ''}`}
                  >
                    <div
                      className={`min-w-0 flex flex-1 items-center gap-2 ${hasChildren ? 'cursor-pointer' : ''}`}
                      role={hasChildren ? 'button' : undefined}
                      tabIndex={hasChildren ? 0 : undefined}
                      aria-expanded={hasChildren ? isExpanded : undefined}
                      onClick={hasChildren ? () => toggleCollapse(parent.id) : undefined}
                      onKeyDown={hasChildren ? onActivateKey(() => toggleCollapse(parent.id)) : undefined}
                    >
                    {hasChildren && (
                      <svg className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold ${parent.isActive ? 'text-slate-700' : 'text-slate-500'}`}>{parent.name}</p>
                        {parent.isParent && (
                          <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                            parent · {children.length} sub-account{children.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {!parent.isActive && (
                          <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">Disabled</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {parent.phone && <span className="text-xs text-slate-500">{parent.phone}</span>}
                        {parent.notes && <span className="text-xs text-slate-500 italic truncate max-w-xs">{parent.notes}</span>}
                      </div>
                    </div>
                  </div>
                  {canManageClients && (
                    <div className="flex items-center gap-2 ml-3 shrink-0 flex-wrap justify-end">
                      {canManagePortalPins && <PortalPinControl pumpId={pumpId} client={parent} />}
                      <button
                        onClick={() => {
                          const next = addSubParentId === parent.id ? null : parent.id
                          setAddSubParentId(next)
                          if (next === parent.id) setExpandedParentId(parent.id)
                          setAddSubName(''); setAddSubPhone(''); setAddSubNotes(''); setAddSubError(null)
                        }}
                        className="ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs text-blue-500 hover:text-blue-700 border border-blue-200 hover:border-blue-400"
                      >
                        + Sub-account
                      </button>
                      <button
                        onClick={() => setEditingId(editingId === parent.id ? null : parent.id)}
                        className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800"
                      >
                        {editingId === parent.id ? 'Cancel' : 'Edit'}
                      </button>
                      <button
                        onClick={() => toggleStatusMutation.mutate({ clientId: parent.id, isActive: !parent.isActive })}
                        disabled={toggleStatusMutation.isPending}
                        className={`ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs border ${
                          parent.isActive
                            ? 'text-slate-500 hover:text-slate-700 border-slate-200'
                            : 'text-emerald-600 hover:text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {parent.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  )}
                </div>

                {canManageClients && editingId === parent.id && (
                  <EditCreditClientForm pumpId={pumpId} client={parent} onSaved={() => setEditingId(null)} />
                )}

                {isExpanded && children.map(child => (
                  <div key={child.id} className="border-t border-slate-100">
                    <div className="flex items-center justify-between pl-7 pr-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-slate-500 shrink-0">└</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-medium ${child.isActive ? 'text-slate-600' : 'text-slate-500'}`}>{child.name}</p>
                            {!child.isActive && (
                              <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">Disabled</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {child.phone && <span className="text-xs text-slate-500">{child.phone}</span>}
                            {child.notes && <span className="text-xs text-slate-500 italic truncate max-w-xs">{child.notes}</span>}
                          </div>
                        </div>
                      </div>
                      {canManageClients && (
                        <div className="flex items-center gap-2 ml-3 shrink-0 flex-wrap justify-end">
                          {canManagePortalPins && <PortalPinControl pumpId={pumpId} client={child} />}
                          <button
                            onClick={() => setEditingId(editingId === child.id ? null : child.id)}
                            className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800">
                            {editingId === child.id ? 'Cancel' : 'Edit'}
                          </button>
                          <button
                            onClick={() => toggleStatusMutation.mutate({ clientId: child.id, isActive: !child.isActive })}
                            disabled={toggleStatusMutation.isPending}
                            className={`ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs border ${
                              child.isActive
                                ? 'text-slate-500 hover:text-slate-700 border-slate-200'
                                : 'text-emerald-600 hover:text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {child.isActive ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      )}
                    </div>
                    {canManageClients && editingId === child.id && (
                      <EditCreditClientForm pumpId={pumpId} client={child} indent onSaved={() => setEditingId(null)} />
                    )}
                  </div>
                ))}

                {canManageClients && addSubParentId === parent.id && (
                  <form onSubmit={e => submitAddSub(e, parent.id)}
                    className="border-t border-blue-100 bg-blue-50/40 px-3 py-3 space-y-2">
                    <p className="text-xs font-semibold text-blue-700">Add sub-account under {parent.name}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block">
                          <span className="ui-label">Name <span className="text-red-500">*</span></span>
                          <input required value={addSubName} onChange={e => setAddSubName(e.target.value)}
                            placeholder="e.g. Driver 1" className="text-xs min-h-10" />
                        </label>
                      </div>
                      <div>
                        <label className="block">
                          <span className="ui-label">Phone <span className="text-red-500">*</span></span>
                          <input required value={addSubPhone}
                            onChange={e => setAddSubPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            inputMode="numeric" maxLength={10} placeholder="e.g. 9876543210" className="text-xs min-h-10" />
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block">
                        <span className="ui-label">Notes <span className="text-slate-500">(optional)</span></span>
                        <input value={addSubNotes} onChange={e => setAddSubNotes(e.target.value)}
                          placeholder="e.g. truck number, driver name" className="text-xs min-h-10" />
                      </label>
                    </div>
                    {addSubError && <p role="alert" className="ui-error-text">{addSubError}</p>}
                    <div className="flex gap-2">
                      <button type="submit" disabled={addMutation.isPending}
                        className="ui-btn ui-btn-primary min-h-0 px-3 py-1.5 text-xs">
                        {addMutation.isPending ? <span className="flex items-center gap-1"><Spinner className="w-3 h-3" />Adding…</span> : 'Add Sub-account'}
                      </button>
                      <button type="button" onClick={() => setAddSubParentId(null)}
                        className="ui-btn ui-btn-secondary min-h-0 px-3 py-1.5 text-xs">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      ) : q ? (
        <p className="text-sm text-slate-500 py-2">No clients match "{deferredSearch}".</p>
      ) : null}

      {canManageClients && (
        <div className={clients.length > 0 ? 'border-t border-slate-200 pt-4' : ''}>
          <p className="ui-label mb-3">
            {clients.length === 0 ? 'Add the first credit client' : 'Add another client'}
          </p>
          <form onSubmit={submitAdd} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block">
                  <span className="ui-label">Client Name <span className="text-red-500">*</span></span>
                  <input required value={name} onChange={e => setName(e.target.value)}
                    placeholder="e.g. ABC Transports" className="text-sm" />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="ui-label">Phone <span className="text-red-500">*</span></span>
                  <input required value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="e.g. 9876543210" inputMode="numeric" maxLength={10} className="text-sm" />
                </label>
              </div>
            </div>
            <div>
              <label className="block">
                <span className="ui-label">Notes <span className="text-slate-500">(optional)</span></span>
                <input value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Fleet manager, lorry owner" className="text-sm" />
              </label>
            </div>
            {addError && <p role="alert" className="ui-error-text">{addError}</p>}
            <button type="submit" disabled={addMutation.isPending} className="ui-btn ui-btn-primary">
              {addMutation.isPending ? <span className="flex items-center gap-1.5"><Spinner />Adding…</span> : 'Add Client'}
            </button>
          </form>
        </div>
      )}

      {!canManageClients && rootClients.length === 0 && (
        <EmptyState icon="generic" title="No credit clients yet"
          subtitle="Contact the Owner or Admin to add credit clients." />
      )}
    </div>
  )
}
