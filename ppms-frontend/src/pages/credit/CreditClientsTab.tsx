import { useId, useState, useDeferredValue } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../api/pumpApi'
import type { CreateCreditClientRequest, CreditClient as PumpCreditClient } from '../../api/pumpApi'
import { Pause, Users } from 'lucide-react'
import { SkeletonRows } from '../../components/Skeleton'
import { StatusBadge } from '../../components/StatusBadge'
import { EmptyState } from '../../components/EmptyState'
import { FormField } from '../../components/FormField'
import { LoadingButton } from '../../components/LoadingButton'
import { parseApiError } from '../../utils/apiError'
import { onActivateKey } from '../../utils/keyboard'
import { isValidGstin, normaliseGstText } from '../../utils/gst'
import { EditCreditClientForm } from './EditCreditClientForm'
import { PortalPinControl } from './PortalPinControl'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'

interface CreditClientsTabProps {
  pumpId: number
  canManageClients: boolean
  canManagePortalPins: boolean
}

export function CreditClientsTab({ pumpId, canManageClients, canManagePortalPins }: CreditClientsTabProps) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()

  const [name, setName]               = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [notes, setNotes]             = useState('')
  const [gstin, setGstin]             = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const [addError, setAddError]       = useState<string | null>(null)
  const [addNameError, setAddNameError]   = useState<string | undefined>()
  const [addPhoneError, setAddPhoneError] = useState<string | undefined>()
  const [addGstinError, setAddGstinError] = useState<string | undefined>()
  const addHeadingId = useId()
  const optional = <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span>

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
    queryFn:  () => pumpApi.getCreditClientAccounts(pumpId),
  })

  const addMutation = useMutation({
    mutationFn: (req: CreateCreditClientRequest) =>
      pumpApi.createCreditClient(pumpId, req),
    onSuccess: () => {
      setName(''); setPhoneNumber(''); setNotes(''); setGstin(''); setBillingAddress(''); setAddError(null)
      setAddSubName(''); setAddSubPhone(''); setAddSubNotes(''); setAddSubError(null); setAddSubParentId(null)
      qc.invalidateQueries({ queryKey: ['creditClients', pumpId] })
    },
    onError: (err, variables) => {
      const msg = parseApiError(err, t('clients.addFailed'))
      if (variables.parentClientId != null) setAddSubError(msg)
      else setAddError(msg)
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: ({ clientId, isActive }: { clientId: number; isActive: boolean }) =>
      pumpApi.toggleCreditClientStatus(pumpId, clientId, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['creditClients', pumpId] }),
    onError: (err) => setAddError(parseApiError(err, t('clients.statusFailed'))),
  })

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault(); setAddError(null)
    const trimmedName = name.trim(); const trimmedPhone = phoneNumber.trim()
    if (!/^\d{10}$/.test(trimmedPhone)) { setAddPhoneError(t('clients.phoneInvalid')); return }
    if (clients.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      setAddNameError(t('clients.duplicateName', { name: trimmedName })); return
    }
    if (!isValidGstin(gstin)) { setAddGstinError(t('common:gst.gstinFormat')); return }
    addMutation.mutate({
      name: trimmedName, phone: trimmedPhone, notes: notes.trim() || undefined,
      gstin: normaliseGstText(gstin) || undefined, billingAddress: billingAddress.trim() || undefined,
    })
  }

  const submitAddSub = (e: React.FormEvent, parentId: number) => {
    e.preventDefault(); setAddSubError(null)
    const trimmedName = addSubName.trim(); const trimmedPhone = addSubPhone.trim()
    if (!/^\d{10}$/.test(trimmedPhone)) { setAddSubError(t('clients.phoneInvalid')); return }
    if (clients.some(c => c.parentClientId === parentId && c.name.toLowerCase() === trimmedName.toLowerCase())) {
      setAddSubError(t('clients.duplicateSubAccount', { name: trimmedName })); return
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
      <p className="text-xs text-ink-3">
        {t('clients.intro')}
        {canManageClients ? ` ${t('clients.introManage')}` : ''}
      </p>

      {rootClients.length > 0 && (
        <div className="ui-search-shell">
          <svg className="ui-search-shell__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input aria-label={t('clients.searchLabel')}
            type="text"
            className="ui-search-shell__input"
            placeholder={t('clients.searchPlaceholder')}
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
          />
          {clientSearch && (
            <button
              type="button"
              onClick={() => setClientSearch('')}
              className="ui-search-shell__clear"
              aria-label={t('aging.clearSearch')}
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
                      <svg className={`w-3.5 h-3.5 text-ink-3 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold ${parent.isActive ? 'text-ink' : 'text-ink-3'}`}>{parent.name}</p>
                        {parent.isParent && (
                          <StatusBadge tone="info" icon={Users}
                            label={t('clients.parentBadge', { count: children.length })} />
                        )}
                        {!parent.isActive && (
                          <StatusBadge tone="neutral" icon={Pause} label={t('clients.disabled')} />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {parent.phone && <span className="text-xs text-ink-3">{parent.phone}</span>}
                        {parent.notes && <span className="text-xs text-ink-3 italic truncate max-w-xs">{parent.notes}</span>}
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
                        className="ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs text-primary hover:text-primary-strong border border-border hover:border-primary"
                      >
                        {t('clients.addSubAccountToggle')}
                      </button>
                      <button
                        onClick={() => setEditingId(editingId === parent.id ? null : parent.id)}
                        className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-primary hover:text-primary-strong"
                      >
                        {editingId === parent.id ? t('common:actions.cancel') : t('common:actions.edit')}
                      </button>
                      <button
                        onClick={() => toggleStatusMutation.mutate({ clientId: parent.id, isActive: !parent.isActive })}
                        disabled={toggleStatusMutation.isPending}
                        className={`ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs border ${
                          parent.isActive
                            ? 'text-ink-3 hover:text-ink border-border'
                            : 'text-ok border-ok/30 hover:bg-ok-bg'
                        }`}
                      >
                        {parent.isActive ? t('common:actions.disable') : t('common:actions.enable')}
                      </button>
                    </div>
                  )}
                </div>

                {canManageClients && editingId === parent.id && (
                  <EditCreditClientForm pumpId={pumpId} client={parent} onSaved={() => setEditingId(null)} />
                )}

                {isExpanded && children.map(child => (
                  <div key={child.id} className="border-t border-border">
                    <div className="flex items-center justify-between pl-7 pr-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-ink-3 shrink-0">└</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-medium ${child.isActive ? 'text-ink-2' : 'text-ink-3'}`}>{child.name}</p>
                            {!child.isActive && (
                              <StatusBadge tone="neutral" icon={Pause} label={t('clients.disabled')} />
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {child.phone && <span className="text-xs text-ink-3">{child.phone}</span>}
                            {child.notes && <span className="text-xs text-ink-3 italic truncate max-w-xs">{child.notes}</span>}
                          </div>
                        </div>
                      </div>
                      {canManageClients && (
                        <div className="flex items-center gap-2 ml-3 shrink-0 flex-wrap justify-end">
                          {canManagePortalPins && <PortalPinControl pumpId={pumpId} client={child} />}
                          <button
                            onClick={() => setEditingId(editingId === child.id ? null : child.id)}
                            className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-primary hover:text-primary-strong">
                            {editingId === child.id ? t('common:actions.cancel') : t('common:actions.edit')}
                          </button>
                          <button
                            onClick={() => toggleStatusMutation.mutate({ clientId: child.id, isActive: !child.isActive })}
                            disabled={toggleStatusMutation.isPending}
                            className={`ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs border ${
                              child.isActive
                                ? 'text-ink-3 hover:text-ink border-border'
                                : 'text-ok border-ok/30 hover:bg-ok-bg'
                            }`}
                          >
                            {child.isActive ? t('common:actions.disable') : t('common:actions.enable')}
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
                    aria-label={t('clients.addSubAccountUnder', { name: parent.name })}
                    className="space-y-3 border-t border-border bg-surface-sunken px-3 py-3">
                    <p className="text-sm font-semibold text-ink">{t('clients.addSubAccountUnder', { name: parent.name })}</p>
                    <FormGrid>
                      <FormField label={t('clientForm.name')}>
                        <input required value={addSubName} onChange={e => setAddSubName(e.target.value)}
                          placeholder={t('clients.subNamePlaceholder')} />
                      </FormField>
                      <FormField label={t('clientForm.phone')}>
                        <input required value={addSubPhone} type="tel" autoComplete="off"
                          onChange={e => setAddSubPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          inputMode="numeric" maxLength={10} placeholder={t('clients.phonePlaceholder')} />
                      </FormField>
                      <FormGridFullRow>
                        <FormField label={<>{t('common:fields.notes')} {optional}</>}>
                          <input value={addSubNotes} onChange={e => setAddSubNotes(e.target.value)}
                            placeholder={t('clients.subNotesPlaceholder')} />
                        </FormField>
                      </FormGridFullRow>
                    </FormGrid>
                    {addSubError && <p role="alert" className="ui-error-text">{addSubError}</p>}
                    <div className="flex flex-wrap gap-2">
                      <LoadingButton type="submit" isLoading={addMutation.isPending} loadingLabel={t('clients.adding')}
                        className="ui-btn-primary">
                        {t('clients.addSubAccount')}
                      </LoadingButton>
                      <button type="button" onClick={() => setAddSubParentId(null)} className="ui-btn ui-btn-secondary">
                        {t('common:actions.cancel')}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      ) : q ? (
        <p className="text-sm text-ink-3 py-2">{t('clients.noMatch', { query: deferredSearch })}</p>
      ) : null}

      {canManageClients && (
        <div className={clients.length > 0 ? 'border-t border-border pt-4' : ''}>
          <h3 id={addHeadingId} className="mb-3 text-sm font-semibold text-ink">
            {clients.length === 0 ? t('clients.addFirst') : t('clients.addAnother')}
          </h3>
          <form onSubmit={submitAdd} aria-labelledby={addHeadingId} className="space-y-3">
            <FormGrid>
              <FormField label={t('clients.clientName')} error={addNameError}>
                <input required value={name} onChange={e => { setName(e.target.value); setAddNameError(undefined) }}
                  placeholder={t('clients.clientNamePlaceholder')} />
              </FormField>
              <FormField label={t('clientForm.phone')} error={addPhoneError}>
                <input required value={phoneNumber} type="tel" autoComplete="off"
                  onChange={e => { setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10)); setAddPhoneError(undefined) }}
                  placeholder={t('clients.phonePlaceholder')} inputMode="numeric" maxLength={10} />
              </FormField>
              <FormGridFullRow>
                <FormField label={<>{t('common:fields.notes')} {optional}</>}>
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('clientForm.notesPlaceholder')} />
                </FormField>
              </FormGridFullRow>
              <FormField label={<>GSTIN {optional}</>} help={t('clientForm.gstinHelp')} error={addGstinError}>
                <input value={gstin} onChange={e => { setGstin(e.target.value.toUpperCase()); setAddGstinError(undefined) }}
                  maxLength={15} autoCapitalize="characters" placeholder={t('common:gst.gstinPlaceholder')} />
              </FormField>
              <FormField label={<>{t('clientForm.billingAddress')} {optional}</>} help={t('clientForm.billingAddressHelp')}>
                <input value={billingAddress} onChange={e => setBillingAddress(e.target.value)} maxLength={500} />
              </FormField>
            </FormGrid>
            {addError && <p role="alert" className="ui-error-text">{addError}</p>}
            <LoadingButton type="submit" isLoading={addMutation.isPending} loadingLabel={t('clients.adding')} className="ui-btn-primary">
              {t('clients.addClient')}
            </LoadingButton>
          </form>
        </div>
      )}

      {!canManageClients && rootClients.length === 0 && (
        <EmptyState icon="generic" title={t('aging.noClients')}
          subtitle={t('clients.emptyReadOnlyHint')} />
      )}
    </div>
  )
}
