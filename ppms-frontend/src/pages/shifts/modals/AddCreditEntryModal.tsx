import { useId, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { shiftApi } from '../../../api/shiftApi'
import { pumpApi } from '../../../api/pumpApi'
import type { Shift, CreditEntryInput } from '../../../types/shift'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { parseApiError } from '../../../utils/apiError'
import { Modal } from '../../../components/Modal'
import { codeLabel } from '../../../constants/labels'
import { CreditClientSearch } from '../components/CreditClientSearch'
import { CreditAmountField } from '../components/CreditAmountField'
import { FormField } from '../../../components/FormField'
import { FormGrid } from '../../../components/layout/FormGrid'
import { LiveFigures } from '../../../components/LiveFigures'
import { MoneyText } from '../../../components/AmountText'
import { StatusBadge } from '../../../components/StatusBadge'
import { StillNeeded } from '../../../components/StillNeeded'
import { FUEL_UNIT } from '../../../constants/fuel'
import { useAuthStore } from '../../../store/authStore'
import { canPerformAction } from '../../../permissions/permissions'
import { focusOnMount } from '../../../utils/focus'
import { useToastStore } from '../../../store/toastStore'
import { readDraft, removeDraft, useSaveDraft, writeDraft } from '../../../hooks/useSaveDraft'
import { DraftRestoredNotice } from '../../../components/DraftRestoredNotice'
import { LoadingButton } from '../../../components/LoadingButton'
import { attemptFor } from '../../../utils/idempotencyKey'
import { formatCurrency } from '../../../utils/format'
import type { SubmitAttempt } from '../../../utils/idempotencyKey'

interface CreditEntryDraft {
  clientSearch: string
  clientName: string
  clientId: number | null
  subAccountId: number | null
  fuelType: string
  amount: string
  liters: string
  inputMode: 'amount' | 'liters'
  billNo: string
  description: string
  submitAttempt: SubmitAttempt | null
}

// ── Add Credit Entry Modal (mid-shift) ────────────────────────────────────────


export function AddCreditEntryModal({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const { t } = useTranslation(['shifts', 'common'])
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const role = useAuthStore((state) => state.user?.role)
  const canVoidEntry = canPerformAction('shift:void-credit-entry', role)
  const { data: creditClients = [] } = useQuery({
    queryKey: ['creditClients', shift.pumpId],
    queryFn: () => pumpApi.getCreditClients(shift.pumpId),
  })
  // The client search loads the same standing list, so this reads it from the shared query.
  const { data: standings = [] } = useQuery({
    queryKey: ['creditStanding', shift.pumpId],
    queryFn:  () => pumpApi.getCreditStanding(shift.pumpId),
    enabled:  creditClients.length > 0,
  })
  const stillNeededId = useId()

  const draftName = `credit-entry:${shift.id}`
  const defaultFuelType = shift.fuelReadings[0]?.fuelType ?? ''
  const [restoredDraft, setRestoredDraft] = useState(() => readDraft<CreditEntryDraft>(draftName))
  const draft = restoredDraft?.values
  const [clientSearch,   setClientSearch]   = useState(() => draft?.clientSearch ?? '')
  const [clientName,     setClientName]     = useState(() => draft?.clientName ?? '')
  const [clientId,       setClientId]       = useState<number | null>(() => draft?.clientId ?? null)
  const [subAccountId,   setSubAccountId]   = useState<number | null>(() => draft?.subAccountId ?? null)
  const [showDropdown,   setShowDropdown]   = useState(false)
  const [fuelType,       setFuelType]       = useState<string>(() => draft?.fuelType ?? defaultFuelType)
  const [amount,         setAmount]         = useState(() => draft?.amount ?? '')
  const [liters,         setLiters]         = useState(() => draft?.liters ?? '')
  const [inputMode,      setInputMode]      = useState<'amount' | 'liters'>(() => draft?.inputMode ?? 'amount')
  const [billNo,         setBillNo]         = useState(() => draft?.billNo ?? '')
  const [description,    setDescription]    = useState(() => draft?.description ?? '')
  const [submitAttempt,  setSubmitAttempt]  = useState<SubmitAttempt | null>(() => draft?.submitAttempt ?? null)
  const [error,          setError]          = useState<string | null>(null)

  const draftValues: CreditEntryDraft = {
    clientSearch, clientName, clientId, subAccountId, fuelType, amount, liters, inputMode, billNo, description, submitAttempt,
  }
  const hasEntries = clientSearch.trim() !== '' || amount !== '' || liters !== '' || billNo.trim() !== '' || description.trim() !== ''
  useSaveDraft(draftName, draftValues, hasEntries)

  const discardRestoredEntries = () => {
    removeDraft(draftName)
    setRestoredDraft(null)
    setClientSearch('')
    setClientName('')
    setClientId(null)
    setSubAccountId(null)
    setFuelType(defaultFuelType)
    setAmount('')
    setLiters('')
    setInputMode('amount')
    setBillNo('')
    setDescription('')
    setSubmitAttempt(null)
    setError(null)
  }

  const priceForFuelType = (ft: string): number | null =>
    shift.fuelReadings.find((r) => r.fuelType === ft)?.priceSnapshot ?? null

  // Void credit entry state
  const [voidTargetId,  setVoidTargetId]   = useState<number | null>(null)
  const [voidReason,    setVoidReason]     = useState('')
  const [voidError,     setVoidError]      = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: ({ entry, idempotencyKey }: { entry: CreditEntryInput; idempotencyKey: string }) =>
      shiftApi.addCreditEntry(shift.pumpId, shift.id, entry, idempotencyKey),
    onSuccess: (_shift, { entry }) => {
      removeDraft(draftName)
      qc.invalidateQueries({ queryKey: ['activeShifts', shift.pumpId] })
      addToast(t('creditEntry.added', { amount: formatCurrency(entry.amount), client: entry.clientName }), 'success')
      onClose()
    },
    onError: (err: unknown) => setError(parseApiError(err, t('creditEntry.saveFailed'))),
  })

  const voidMutation = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: number; reason: string }) =>
      shiftApi.voidCreditEntry(shift.pumpId, shift.id, entryId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activeShifts', shift.pumpId] })
      setVoidTargetId(null); setVoidReason(''); setVoidError(null)
    },
    onError: (err: unknown) => setVoidError(parseApiError(err, t('creditEntry.deleteFailed'))),
  })

  const selectedParent = creditClients.find(c => c.id === clientId)
  const subAccounts = selectedParent?.isParent
    ? creditClients.filter(c => c.parentClientId === clientId)
    : []

  const canSave =
    clientId !== null &&
    fuelType.length > 0 &&
    parseFloat(amount) > 0

  const handleSubmit = () => {
    const amt = parseFloat(amount)
    if (!clientId)           { setError(t('creditEntry.selectClient')); return }
    if (!fuelType)           { setError(t('creditEntry.fuelRequired')); return }
    if (!amount || isNaN(amt) || amt <= 0) { setError(t('creditEntry.validAmount')); return }
    setError(null)
    const entry: CreditEntryInput = {
      clientId:    subAccountId ?? clientId,
      clientName: clientName.trim(),
      fuelType,
      amount: amt,
      billNo:      billNo.trim() || undefined,
      description: description.trim() || undefined,
    }
    // Saved before sending, so a resend after a timeout (even after a reload) reuses the key.
    const attempt = attemptFor(submitAttempt, entry)
    setSubmitAttempt(attempt)
    writeDraft(draftName, { ...draftValues, submitAttempt: attempt })
    mutation.mutate({ entry, idempotencyKey: attempt.key })
  }

  const unit = FUEL_UNIT[fuelType] ?? 'L'
  const amountValue = parseFloat(amount)
  const availableCredit = clientId === null
    ? null
    : standings.find((standing) => standing.clientId === clientId)?.availableCredit ?? null
  const leftAfterSale = availableCredit !== null && amountValue > 0 ? availableCredit - amountValue : null
  const stillNeeded = [
    clientId === null && t('creditEntry.stillNeeded.client'),
    fuelType.length === 0 && t('creditEntry.stillNeeded.fuel'),
    !(amountValue > 0) && t('creditEntry.stillNeeded.amount'),
  ].filter((item): item is string => typeof item === 'string')

  return (
    <Modal
      title={t('creditEntry.title')}
      subtitle={t('creditEntry.subtitle', { nozzles: shift.nozzles.map((n) => `#${n.nozzleNumber}`).join(', '), operator: shift.operatorName })}
      tone="info"
      size="md-wide"
      fullScreenOnPhone
      onClose={onClose}
      canClose={!mutation.isPending}
      bodyClassName="space-y-4"
      footer={
        <>
          <StillNeeded id={stillNeededId} items={stillNeeded} />
          <button type="button" onClick={onClose} disabled={mutation.isPending} className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <LoadingButton type="button" onClick={handleSubmit} disabled={!canSave} isLoading={mutation.isPending}
            aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
            loadingLabel={t('creditEntry.saving')}
            className="ui-btn-primary">
            {t('creditEntry.save')}
          </LoadingButton>
        </>
      }
    >
          {restoredDraft && (
            <DraftRestoredNotice savedAt={restoredDraft.savedAt} onDiscard={discardRestoredEntries} />
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
            placeholder={t('creditEntry.searchClient')}
          />

          {/* Sub-account picker — shown when selected parent has children */}
          {subAccounts.length > 0 && (
            <div>
              <span id={`${stillNeededId}-sub-account`} className="ui-label">
                {t('creditEntry.subAccount')} <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span>
              </span>
              <SearchableSelect aria-labelledby={`${stillNeededId}-sub-account`}
                value={subAccountId != null ? subAccountId.toString() : ''}
                onChange={v => setSubAccountId(v === '' ? null : Number(v))}
                placeholder={t('creditEntry.billToParentOption', { name: clientName })}
                options={subAccounts.map(s => ({ value: s.id.toString(), label: s.name }))}
              />
            </div>
          )}

          <FormGrid>
            <div>
              <span id={`${stillNeededId}-fuel`} className="ui-label">{t('creditEntry.fuel')}</span>
              <SearchableSelect aria-labelledby={`${stillNeededId}-fuel`}
                value={fuelType}
                onChange={v => {
                  setFuelType(v)
                  if (inputMode === 'liters') { setAmount(''); setLiters('') }
                }}
                options={shift.fuelReadings.map(r => ({
                  value: r.fuelType,
                  label: codeLabel(r.fuelType),
                }))}
              />
            </div>
            <CreditAmountField
              mode={inputMode}
              amount={amount}
              liters={liters}
              price={priceForFuelType(fuelType)}
              unit={unit}
              onAmountMode={() => { setInputMode('amount'); setLiters('') }}
              onLitresMode={() => {
                const price = priceForFuelType(fuelType)
                const initLiters = price && amount ? (parseFloat(amount) / price).toFixed(2) : ''
                setInputMode('liters')
                setLiters(initLiters)
              }}
              onAmountChange={setAmount}
              onLitresChange={(value) => {
                const price = priceForFuelType(fuelType)
                const amt = price && value ? (parseFloat(value) * price).toFixed(2) : ''
                setLiters(value)
                setAmount(amt)
              }}
            />
            <FormField label={<>{t('creditEntry.billNo')} <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span></>}>
              <input type="text" value={billNo} onChange={(e) => setBillNo(e.target.value)}
                placeholder={t('creditEntry.billNoPlaceholder')} />
            </FormField>
            <FormField label={<>{t('creditEntry.description')} <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span></>}>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder={t('creditEntry.descriptionPlaceholder')} />
            </FormField>
          </FormGrid>

          {availableCredit !== null && (
            <LiveFigures
              label={t('creditEntry.creditLimit')}
              figures={[
                { label: t('creditEntry.availableCredit'), value: <MoneyText value={availableCredit} /> },
                {
                  label: t('creditEntry.leftAfterSale'),
                  value: <MoneyText value={leftAfterSale} tone={leftAfterSale !== null && leftAfterSale < 0 ? 'bad' : undefined} />,
                  isResult: true,
                },
              ]}
            />
          )}

          {error && (
            <p role="alert" className="ui-alert ui-alert-danger">{error}</p>
          )}

          {/* Existing credit entries with void option */}
          {shift.creditEntries.length > 0 && (
            <section aria-labelledby={`${stillNeededId}-recorded`} className="rounded-card border border-border">
              <div className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2">
                <h3 id={`${stillNeededId}-recorded`} className="text-sm font-semibold text-ink">{t('creditEntry.recorded')}</h3>
                {canVoidEntry && <span className="text-xs text-ink-3">{t('creditEntry.tapVoid')}</span>}
              </div>
              <ul className="divide-y divide-border max-h-48 overflow-y-auto">
                {shift.creditEntries.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2 px-3 py-2">
                    <div className={`flex-1 min-w-0 ${entry.voidStatus === 'VOIDED' ? 'line-through' : ''}`}>
                      <p className="text-sm font-medium text-ink truncate">{entry.clientName}</p>
                      <p className="text-xs text-ink-3">
                        {formatCurrency(entry.amount)}
                        {entry.fuelType && ` · ${codeLabel(entry.fuelType)}`}
                      </p>
                    </div>
                    {entry.voidStatus === 'VOIDED' && <StatusBadge tone="neutral" label={t('common:badges.voided')} />}
                    {canVoidEntry && entry.voidStatus !== 'VOIDED' && voidTargetId !== entry.id && (
                      <button
                        type="button"
                        onClick={() => { setVoidTargetId(entry.id); setVoidReason(''); setVoidError(null) }}
                        className="ui-btn ui-btn-secondary ui-btn-compact shrink-0"
                      >
                        {t('creditEntry.void')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {voidTargetId !== null && (
                <div className="space-y-2 border-t border-border bg-surface-sunken px-3 py-3">
                  <FormField label={t('creditEntry.voidReason')} error={voidError ?? undefined} help={t('creditEntry.voidHint')}>
                    <input
                      ref={focusOnMount}
                      type="text"
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                    />
                  </FormField>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setVoidTargetId(null); setVoidReason('') }}
                      className="ui-btn ui-btn-secondary ui-btn-compact">
                      {t('common:actions.cancel')}
                    </button>
                    <LoadingButton
                      type="button"
                      onClick={() => {
                        if (!voidReason.trim()) { setVoidError(t('creditEntry.reasonRequired')); return }
                        voidMutation.mutate({ entryId: voidTargetId, reason: voidReason.trim() })
                      }}
                      isLoading={voidMutation.isPending}
                      loadingLabel={t('creditEntry.voiding')}
                      className="ui-btn-danger ui-btn-compact">
                      {t('creditEntry.confirmVoid')}
                    </LoadingButton>
                  </div>
                </div>
              )}
            </section>
          )}
    </Modal>
  )
}
