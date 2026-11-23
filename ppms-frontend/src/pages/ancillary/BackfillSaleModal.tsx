import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ancillaryApi } from '../../api/ancillaryApi'
import { pumpApi } from '../../api/pumpApi'
import type { AncillaryProduct, BackfillSaleRequest, AncillaryPaymentMode } from '../../api/ancillaryApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { localDateInputValue } from '../../utils/date'
import { useToastStore } from '../../store/toastStore'
import { Modal } from '../../components/Modal'
import { NumericInput } from '../../components/NumericInput'
import { FormField } from '../../components/FormField'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'
import { LiveFigures } from '../../components/LiveFigures'
import { LoadingButton } from '../../components/LoadingButton'
import { StatusBadge } from '../../components/StatusBadge'
import { StillNeeded } from '../../components/StillNeeded'
import { parseApiError } from '../../utils/apiError'
import { PAYMENT_MODES, fmtDate, paymentModeBadge } from './ancillaryFormat'
import { ReviewList, ReviewRow } from './ReviewRow'
import { codeLabel } from '../../constants/labels'

interface FieldErrors {
  product?: string
  saleDate?: string
  quantity?: string
  client?: string
}

/**
 * 2-step modal for Admin/Owner to retroactively record a historical counter sale.
 *
 * Key differences from the live SellDialog:
 * - Requires a past date (saleDate strictly before today).
 * - The selling price is NOT entered by the user — the backend resolves it from
 *   the product's price history for the chosen date.
 * - FIFO deduction is restricted to lots delivered on or before saleDate.
 * - Before recording a sale for a date, the product must have a historical stock
 *   delivery on or before that date (enforce this via the Stock In tab first).
 */
export function BackfillSaleModal({
  pumpId, products, onClose, onSuccess,
}: {
  pumpId: number
  products: AncillaryProduct[]
  onClose: () => void
  onSuccess: () => void
}) {
  const { t } = useTranslation(['ancillary', 'common'])
  const { addToast } = useToastStore()
  const stillNeededId = useId()
  const yesterday = localDateInputValue(-1)

  const [step, setStep] = useState<'form' | 'review'>('form')
  const [form, setForm] = useState<BackfillSaleRequest>({
    productId: products[0]?.id ?? 0,
    saleDate: yesterday,
    quantityUnits: 1,
    paymentMode: 'CASH',
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)

  const { data: creditClients = [] } = useQuery({
    queryKey: ['creditClients', pumpId],
    queryFn: () => pumpApi.getCreditClients(pumpId),
    enabled: form.paymentMode === 'CREDIT',
  })

  const backfillMutation = useMutation({
    mutationFn: (data: BackfillSaleRequest) => ancillaryApi.backfillSale(pumpId, data),
    onSuccess: () => {
      addToast(t('backfill.backfilled'), 'success')
      onSuccess()
    },
    onError: (err) => {
      const msg = parseApiError(err, t('backfill.failed'))
      setServerError(msg)
      addToast(msg, 'error')
    },
  })

  const selectedProduct = products.find(p => p.id === form.productId) ?? null
  const hasQuantity = form.quantityUnits > 0

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}
    if (!form.productId) errors.product = t('validation.selectProduct')
    if (!form.saleDate) errors.saleDate = t('backfill.dateMissing')
    else if (form.saleDate >= localDateInputValue()) errors.saleDate = t('backfill.dateNotPast')
    if (!form.quantityUnits || form.quantityUnits < 1) errors.quantity = t('validation.quantityMin')
    if (form.paymentMode === 'CREDIT' && !form.clientId) errors.client = t('validation.creditClient')
    return errors
  }

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault()
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setServerError(null)
    setStep('review')
  }

  const stillNeeded = [
    ...(form.productId ? [] : [t('stockIn.needProduct')]),
    ...(form.saleDate ? [] : [t('backfill.needDate')]),
    ...(hasQuantity ? [] : [t('sell.needQuantity')]),
    ...(form.paymentMode === 'CREDIT' && !form.clientId ? [t('sell.needClient')] : []),
  ]

  const stockAfter = selectedProduct && hasQuantity ? selectedProduct.currentStockUnits - form.quantityUnits : null

  const optional = (label: string) => (
    <>{label} <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span></>
  )

  return (
    <Modal
      tone="info"
      title={step === 'form' ? t('backfill.title') : t('backfill.reviewTitle')}
      subtitle={step === 'form'
        ? t('backfill.subtitle')
        : `${selectedProduct?.displayName ?? '—'} · ${fmtDate(form.saleDate)}`}
      size="lg"
      onClose={onClose}
      canClose={!backfillMutation.isPending}
      closeOnBackdropClick
      onSubmit={step === 'form' ? handleReview : undefined}
      bodyClassName="space-y-4"
      footer={step === 'form' ? (
        <>
          <StillNeeded id={stillNeededId} items={stillNeeded} />
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">{t('common:actions.cancel')}</button>
          <button type="submit" disabled={stillNeeded.length > 0}
            aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
            className="ui-btn ui-btn-primary">
            {t('common:actions.review')}
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => { setStep('form'); setServerError(null) }}
            disabled={backfillMutation.isPending} className="ui-btn ui-btn-secondary">
            {t('common:actions.edit')}
          </button>
          <LoadingButton type="button" isLoading={backfillMutation.isPending} loadingLabel={t('actions.recording')}
            onClick={() => backfillMutation.mutate(form)} className="ui-btn-primary">
            {t('backfill.confirm')}
          </LoadingButton>
        </>
      )}
    >
        {step === 'form' && (
          <>
            <FormGrid>
              <FormGridFullRow>
                <span className="ui-label">{t('fields.product')}</span>
                <SearchableSelect label={t('fields.product')}
                  value={form.productId ? form.productId.toString() : ''}
                  onChange={v => setForm(f => ({ ...f, productId: v ? parseInt(v) : 0 }))}
                  placeholder={t('fields.selectProduct')}
                  options={products.map(p => ({ value: p.id.toString(), label: t('fields.productOption', { name: p.displayName, stock: p.currentStockUnits }) }))}
                />
                {fieldErrors.product && <p role="alert" className="ui-error-text">{fieldErrors.product}</p>}
              </FormGridFullRow>

              <FormField label={t('backfill.saleDate')} error={fieldErrors.saleDate} help={fieldErrors.saleDate ? undefined : t('backfill.saleDateHelp')}>
                <input
                  type="date"
                  value={form.saleDate}
                  max={yesterday}
                  onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))}
                />
              </FormField>

              <FormField label={t('fields.quantity')} error={fieldErrors.quantity}>
                <NumericInput
                  unit={t('fields.unitsSuffix')}
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={form.quantityUnits || ''}
                  onChange={e => setForm(f => ({ ...f, quantityUnits: parseInt(e.target.value) || 0 }))}
                />
              </FormField>

              <div>
                <span className="ui-label">{t('fields.paymentMode')}</span>
                <SearchableSelect label={t('fields.paymentMode')}
                  value={form.paymentMode}
                  onChange={v => setForm(f => ({
                    ...f,
                    paymentMode: v as AncillaryPaymentMode,
                    clientId: v !== 'CREDIT' ? undefined : f.clientId,
                    clientName: v !== 'CREDIT' ? undefined : f.clientName,
                  }))}
                  options={PAYMENT_MODES.map(m => ({ value: m, label: codeLabel(m) }))}
                />
              </div>

              {form.paymentMode === 'CREDIT' && (
                <div>
                  <span className="ui-label">{t('fields.client')}</span>
                  <SearchableSelect label={t('fields.client')}
                    value={form.clientId ? form.clientId.toString() : ''}
                    onChange={v => {
                      const client = creditClients.find(c => c.id === parseInt(v))
                      setForm(f => ({ ...f, clientId: client?.id, clientName: client?.name }))
                    }}
                    placeholder={t('fields.searchClient')}
                    options={creditClients.map(c => ({
                      value: c.id.toString(),
                      label: c.name + (c.phone ? ` · ${c.phone}` : ''),
                    }))}
                  />
                  {fieldErrors.client && <p role="alert" className="ui-error-text">{fieldErrors.client}</p>}
                </div>
              )}

              <FormField label={optional(t('fields.billNo'))}>
                <input
                  value={form.billNo ?? ''}
                  onChange={e => setForm(f => ({ ...f, billNo: e.target.value || undefined }))}
                />
              </FormField>

              <FormGridFullRow>
                <FormField label={optional(t('common:fields.notes'))}>
                  <input
                    value={form.notes ?? ''}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value || undefined }))}
                  />
                </FormField>
              </FormGridFullRow>
            </FormGrid>

            <LiveFigures
              label={t('sell.stockAfter')}
              figures={[
                { label: t('backfill.price'), value: <span className="text-ink-2">{t('backfill.priceFromHistory')}</span> },
                { label: t('sell.stockAfter'), value: stockAfter == null ? '—' : t('fields.quantityUnits', { count: stockAfter }), isResult: true },
              ]}
            />
            <p className="ui-help">{t('backfill.note')}</p>

            {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
          </>
        )}

        {step === 'review' && (
          <>
            <ReviewList>
              <ReviewRow label={t('fields.product')} value={selectedProduct?.displayName ?? '—'} />
              <ReviewRow label={t('backfill.saleDate')} value={fmtDate(form.saleDate)} />
              <ReviewRow label={t('fields.quantity')} value={t('fields.quantityUnits', { count: form.quantityUnits })} />
              <ReviewRow label={t('fields.paymentMode')} value={<StatusBadge {...paymentModeBadge(form.paymentMode)} />} />
              {form.paymentMode === 'CREDIT' && <ReviewRow label={t('fields.client')} value={form.clientName ?? '—'} />}
              {form.billNo && <ReviewRow label={t('fields.billNo')} value={form.billNo} />}
              {form.notes && <ReviewRow label={t('common:fields.notes')} value={form.notes} />}
              <ReviewRow label={t('backfill.price')} value={t('backfill.priceFromHistory')} />
              <ReviewRow label={t('backfill.recordedAs')} value={<StatusBadge tone="neutral" label={t('fields.backfilled')} />} />
            </ReviewList>
            {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
          </>
        )}
    </Modal>
  )
}
