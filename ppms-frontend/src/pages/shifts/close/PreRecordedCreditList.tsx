import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { shiftApi } from '../../../api/shiftApi'
import type { Shift } from '../../../types/shift'
import { parseApiError } from '../../../utils/apiError'
import type { CreditEntry } from '../../../types/shift'
import { MoneyText } from '../../../components/AmountText'
import { focusOnMount } from '../../../utils/focus'
import { codeLabel } from '../../../constants/labels'
import { formatCurrency } from '../../../utils/format'
import { formatUnits } from './closeShiftTotals'

interface Props {
  shift: Shift
  entries: CreditEntry[]
  total: number
  onEdit: (entry: CreditEntry) => void
  onVoided: (entryId: number) => void
}

export function PreRecordedCreditList({ shift, entries, total, onEdit, onVoided }: Props) {
  const { t } = useTranslation(['shifts', 'common'])
  const queryClient = useQueryClient()
  const [voidingEntryId,    setVoidingEntryId]   = useState<number | null>(null)
  const [voidReasonInput,   setVoidReasonInput]  = useState('')
  const [voidError,         setVoidError]        = useState<string | null>(null)

  const voidMutation = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: number; reason: string }) =>
      shiftApi.voidCreditEntry(shift.pumpId, shift.id, entryId, reason),
    onSuccess: (_, { entryId }) => {
      onVoided(entryId)
      setVoidingEntryId(null)
      setVoidReasonInput('')
      setVoidError(null)
      queryClient.invalidateQueries({ queryKey: ['activeShifts', shift.pumpId] })
    },
    onError: (err: unknown) => setVoidError(parseApiError(err, t('creditEntry.deleteFailed'))),
  })

  const startVoid = (entryId: number) => {
    setVoidingEntryId(entryId)
    setVoidReasonInput('')
    setVoidError(null)
  }

  // Price lookup per fuel type (for liters display)
  const priceFor = (ft: string | null) =>
    ft ? (shift.fuelReadings.find(r => r.fuelType === ft)?.priceSnapshot ?? null) : null

  return (
    <div className="px-3 py-2.5 border-b border-border">
      <p className="text-xs font-semibold text-ink-2 mb-2">
        {t('close.preRecorded.heading', { count: entries.length })}
      </p>
      <div className="space-y-2">
        {entries.map((e) => {
          const price   = priceFor(e.fuelType)
          const liters  = price ? (e.amount / price) : null
          const unit    = e.fuelType === 'CNG' ? 'kg' : 'L'
          const isVoiding = voidingEntryId === e.id

          return (
            <div key={e.id} className="ui-card-plain bg-surface border-border p-0 overflow-hidden">
              {/* Entry summary row */}
              <div className="flex items-start justify-between px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-ink">{e.clientName}</span>
                    {e.fuelType && (
                      <span className="text-xs text-ink-3">{codeLabel(e.fuelType)}</span>
                    )}
                    {e.billNo && (
                      <span className="text-xs text-ink-3">#{e.billNo}</span>
                    )}
                  </div>
                  {liters && price ? (
                    <p className="text-xs text-ink-3 mt-0.5">
                      {formatUnits(liters, unit)} × {formatCurrency(price)} =&nbsp;
                      <MoneyText value={e.amount} className="font-semibold text-ok" />
                    </p>
                  ) : (
                    <p className="text-xs font-semibold text-ok mt-0.5"><MoneyText value={e.amount} /></p>
                  )}
                  {e.description && (
                    <p className="text-xs text-ink-3 italic mt-0.5">{e.description}</p>
                  )}
                </div>
                {!isVoiding && (
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEdit(e)}
                      disabled={voidMutation.isPending}
                      className="text-xs text-primary hover:text-primary-strong font-medium
 transition-colors disabled:opacity-40"
                    >
                      {t('common:actions.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => startVoid(e.id)}
                      className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-bad hover:text-bad"
                    >
                      {t('common:actions.delete')}
                    </button>
                  </div>
                )}
              </div>

              {/* Inline void reason form */}
              {isVoiding && (
                <div className="border-t border-border bg-bad-bg px-3 py-2">
                  <div className="ui-inline-form space-y-2 border-bad bg-surface">
                  <input aria-label={t('close.preRecorded.reasonAria')}
                    ref={focusOnMount}
                    type="text"
                    value={voidReasonInput}
                    onChange={e => setVoidReasonInput(e.target.value)}
                    onKeyDown={event => {
                      if (event.key !== 'Escape') return
                      event.preventDefault()
                      setVoidingEntryId(null); setVoidReasonInput(''); setVoidError(null)
                    }}
                    placeholder={t('close.preRecorded.reasonPlaceholder')}
                    className="ui-input-compact text-xs"
                  />
                  {voidError && <p role="alert" className="ui-error-text">{voidError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setVoidingEntryId(null); setVoidReasonInput(''); setVoidError(null) }}
                      className="ui-btn ui-btn-secondary min-h-0 flex-1 px-3 py-1 text-xs"
                    >
                      {t('common:actions.cancel')}
                    </button>
                    <button
                      type="button"
                      disabled={voidMutation.isPending}
                      onClick={() => {
                        if (!voidReasonInput.trim()) { setVoidError(t('close.preRecorded.reasonRequired')); return }
                        voidMutation.mutate({ entryId: e.id, reason: voidReasonInput.trim() })
                      }}
                      className="ui-btn ui-btn-danger min-h-0 flex-1 px-3 py-1 text-xs disabled:opacity-50"
                    >
                      {voidMutation.isPending ? '…' : t('close.preRecorded.confirmDelete')}
                    </button>
                  </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-2 pt-1.5 border-t border-border">
        <span className="text-xs text-ink-2">{t('close.preRecorded.subtotal')}</span>
        <MoneyText value={total} className="text-xs font-semibold text-ink" />
      </div>
    </div>
  )
}
