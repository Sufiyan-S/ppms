import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct, RecordStockDeliveryRequest } from '../../api/ancillaryApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { localDateInputValue } from '../../utils/date'
import { useToastStore } from '../../store/toastStore'
import { Modal } from '../../components/Modal'
import { MoneyText } from '../../components/AmountText'
import { NumericInput } from '../../components/NumericInput'
import { FormField } from '../../components/FormField'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'
import { LiveFigures } from '../../components/LiveFigures'
import { LoadingButton } from '../../components/LoadingButton'
import { StillNeeded } from '../../components/StillNeeded'
import { parseApiError } from '../../utils/apiError'
import { ReviewList, ReviewRow } from './ReviewRow'
import { fmtCurrency, fmtDate } from './ancillaryFormat'

interface FieldErrors {
  product?: string
  quantity?: string
  cost?: string
  date?: string
}

/** Records stock arriving for a product: the delivery form with a live total cost, then a review step. */
export function StockInDialog({
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
  const today = localDateInputValue()
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [form, setForm] = useState<RecordStockDeliveryRequest & { productId: number | '' }>({
    productId: products[0]?.id ?? '',
    quantityUnits: 1,
    costPricePerUnit: 0,
    deliveryDate: today,
    invoiceReference: '',
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)

  const deliveryMutation = useMutation({
    mutationFn: (data: { productId: number; req: RecordStockDeliveryRequest }) =>
      ancillaryApi.recordDelivery(pumpId, data.productId, data.req),
    onSuccess: () => {
      addToast(t('stockIn.recorded'), 'success')
      onSuccess()
    },
    onError: (err) => {
      const msg = parseApiError(err, t('stockIn.recordFailed'))
      setServerError(msg)
      addToast(msg, 'error')
    },
  })

  const selectedProduct = products.find(p => p.id === form.productId) ?? null
  const hasQuantity = form.quantityUnits > 0
  const totalCost = hasQuantity && form.costPricePerUnit > 0
    ? form.quantityUnits * form.costPricePerUnit
    : null

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}
    if (!form.productId) errors.product = t('validation.selectProduct')
    if (!form.quantityUnits || form.quantityUnits < 1) errors.quantity = t('validation.quantityMin')
    if (!form.costPricePerUnit || form.costPricePerUnit <= 0) errors.cost = t('stockIn.costInvalid')
    if (!form.deliveryDate) errors.date = t('stockIn.dateMissing')
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

  const handleSubmit = () => {
    if (Object.keys(validate()).length > 0) {
      setStep('form')
      return
    }
    deliveryMutation.mutate({
      productId: form.productId as number,
      req: {
        quantityUnits: form.quantityUnits,
        costPricePerUnit: form.costPricePerUnit,
        deliveryDate: form.deliveryDate,
        invoiceReference: form.invoiceReference?.trim() || undefined,
      },
    })
  }

  const stillNeeded = [
    ...(form.productId ? [] : [t('stockIn.needProduct')]),
    ...(hasQuantity ? [] : [t('stockIn.needQuantity')]),
    ...(form.costPricePerUnit > 0 ? [] : [t('stockIn.needCost')]),
    ...(form.deliveryDate ? [] : [t('stockIn.needDate')]),
  ]

  const stockAfter = selectedProduct && hasQuantity ? selectedProduct.currentStockUnits + form.quantityUnits : null

  return (
    <Modal
      tone="info"
      title={step === 'form' ? t('stockIn.title') : t('stockIn.reviewTitle')}
      subtitle={step === 'form' ? t('stockIn.subtitle') : selectedProduct?.displayName}
      size="lg"
      onClose={onClose}
      canClose={!deliveryMutation.isPending}
      closeOnBackdropClick
      onSubmit={step === 'form' ? handleReview : undefined}
      bodyClassName="space-y-4"
      footer={step === 'form' ? (
        <>
          <StillNeeded id={stillNeededId} items={stillNeeded} />
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <button type="submit" disabled={stillNeeded.length > 0}
            aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
            className="ui-btn ui-btn-primary">
            {t('common:actions.review')}
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => { setStep('form'); setServerError(null) }}
            disabled={deliveryMutation.isPending} className="ui-btn ui-btn-secondary">
            {t('common:actions.edit')}
          </button>
          <LoadingButton type="button" isLoading={deliveryMutation.isPending} loadingLabel={t('actions.recording')}
            onClick={handleSubmit} className="ui-btn-primary">
            {t('stockIn.confirm')}
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
                  onChange={v => setForm(f => ({ ...f, productId: v ? parseInt(v) : '' }))}
                  placeholder={t('fields.selectProduct')}
                  options={products.map(p => ({ value: p.id.toString(), label: t('fields.productOption', { name: p.displayName, stock: p.currentStockUnits }) }))}
                />
                {fieldErrors.product && <p role="alert" className="ui-error-text">{fieldErrors.product}</p>}
              </FormGridFullRow>
              <FormField label={t('fields.quantity')} error={fieldErrors.quantity}>
                <NumericInput
                  unit={t('fields.unitsSuffix')}
                  min="1"
                  step="1"
                  inputMode="numeric"
                  data-autofocus
                  value={form.quantityUnits || ''}
                  onChange={e => setForm(f => ({ ...f, quantityUnits: parseInt(e.target.value) || 0 }))}
                />
              </FormField>
              <FormField label={t('stockIn.costPricePerUnit')} error={fieldErrors.cost}>
                <NumericInput
                  unit="₹"
                  min="0.01"
                  step="0.01"
                  value={form.costPricePerUnit || ''}
                  onChange={e => setForm(f => ({ ...f, costPricePerUnit: parseFloat(e.target.value) || 0 }))}
                />
              </FormField>
              <FormField label={t('stockIn.deliveryDate')} error={fieldErrors.date}>
                <input
                  type="date"
                  value={form.deliveryDate}
                  onChange={e => setForm(f => ({ ...f, deliveryDate: e.target.value }))}
                />
              </FormField>
              <FormField label={<>{t('stockIn.invoiceReference')} <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span></>}>
                <input
                  value={form.invoiceReference ?? ''}
                  onChange={e => setForm(f => ({ ...f, invoiceReference: e.target.value }))}
                />
              </FormField>
            </FormGrid>

            <LiveFigures
              label={t('stockIn.totalCost')}
              figures={[
                {
                  label: t('stockIn.stockAfter'),
                  value: stockAfter == null ? '—' : t('fields.quantityUnits', { count: stockAfter }),
                },
                {
                  label: (
                    <>
                      {t('stockIn.totalCost')}
                      {totalCost != null && (
                        <span className="ml-1.5 font-normal text-ink-3 tabular-nums">
                          {t('sell.quantityTimesPrice', { count: form.quantityUnits, price: fmtCurrency(form.costPricePerUnit) })}
                        </span>
                      )}
                    </>
                  ),
                  value: <MoneyText value={totalCost} />,
                  isResult: true,
                },
              ]}
            />

            {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
          </>
        )}

        {step === 'review' && (
          <>
            <ReviewList>
              <ReviewRow label={t('fields.product')} value={selectedProduct?.displayName ?? '—'} />
              <ReviewRow label={t('fields.quantity')} value={t('fields.quantityUnits', { count: form.quantityUnits })} />
              <ReviewRow label={t('stockIn.costPricePerUnit')} value={fmtCurrency(form.costPricePerUnit)} />
              <ReviewRow label={t('stockIn.deliveryDate')} value={fmtDate(form.deliveryDate)} />
              <ReviewRow label={t('stockIn.invoiceReference')} value={form.invoiceReference?.trim() || '—'} />
              {stockAfter != null && <ReviewRow label={t('stockIn.stockAfter')} value={t('fields.quantityUnits', { count: stockAfter })} />}
              <ReviewRow label={t('stockIn.totalCost')} value={<MoneyText value={totalCost} />} isResult />
            </ReviewList>
            {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
          </>
        )}
    </Modal>
  )
}
