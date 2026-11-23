import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ancillaryApi } from '../../api/ancillaryApi'
import { pumpApi } from '../../api/pumpApi'
import type { AncillaryProduct, RecordAncillarySaleRequest, AncillaryPaymentMode } from '../../api/ancillaryApi'
import { useAuthStore } from '../../store/authStore'
import { SearchableSelect } from '../../components/SearchableSelect'
import { NumericInput } from '../../components/NumericInput'
import { useToastStore } from '../../store/toastStore'
import { Modal } from '../../components/Modal'
import { MoneyText } from '../../components/AmountText'
import { FormField } from '../../components/FormField'
import { FormGrid } from '../../components/layout/FormGrid'
import { LiveFigures } from '../../components/LiveFigures'
import type { LiveFigure } from '../../components/LiveFigures'
import { LoadingButton } from '../../components/LoadingButton'
import { StatusBadge } from '../../components/StatusBadge'
import { StillNeeded } from '../../components/StillNeeded'
import { parseApiError } from '../../utils/apiError'
import { PAYMENT_MODES, fmtCurrency, paymentModeBadge } from './ancillaryFormat'
import { ReviewList, ReviewRow } from './ReviewRow'
import { codeLabel } from '../../constants/labels'

/**
 * Computes the projected total profit for a sale by walking through active FIFO lots
 * in consumption order and computing (sellPrice - costPrice) × consumedQty per batch.
 *
 * This correctly handles multi-batch sales where different lots have different cost prices.
 * Example: lots = [{5 units @ ₹100}, {2 units @ ₹200}], sell 6 @ ₹120
 *   → batch1: (120-100)×5 = 100, batch2: (120-200)×1 = -80 → total = 20
 *   (the old approach of (120-100)×6 = 120 was incorrect)
 *
 * Returns null when lot data is insufficient to cover the requested quantity
 * (e.g. lots were consumed by another sale after the page loaded).
 */
function computeFifoProjectedProfit(
  qty: number,
  sellPricePerUnit: number,
  lots: AncillaryProduct['activeFifoLots'],
): number | null {
  if (!lots || lots.length === 0) return null
  let remaining = qty
  let totalCost = 0
  for (const lot of lots) {
    if (remaining <= 0) break
    const consumed = Math.min(remaining, lot.remainingQuantity)
    totalCost += consumed * lot.costPricePerUnit
    remaining -= consumed
  }
  if (remaining > 0) return null  // insufficient lot data for this quantity
  return qty * sellPricePerUnit - totalCost
}

interface FieldErrors {
  quantity?: string
  price?: string
  client?: string
}

/** Records a counter sale: the sale form with a live total, then a review step before saving. */
export function SellDialog({
  pumpId, product, onClose, onSuccess,
}: {
  pumpId: number
  product: AncillaryProduct
  onClose: () => void
  onSuccess: () => void
}) {
  const { t } = useTranslation(['ancillary', 'common'])
  const { addToast } = useToastStore()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const stillNeededId = useId()
  const canSeeCost = user?.role !== 'OPERATOR'
  const canOverridePrice = user?.role === 'OWNER' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [form, setForm] = useState<RecordAncillarySaleRequest>({
    productId: product.id,
    quantityUnits: 1,
    sellingPricePerUnit: 0,
    paymentMode: 'CASH',
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)

  // Sales must use the configured price; only Owner/Admin may change it for a single sale.
  const { data: priceHistory, isLoading: priceLoading } = useQuery({
    queryKey: ['ancillary-price-history', pumpId, product.id],
    queryFn: () => ancillaryApi.getPriceHistory(pumpId, product.id),
  })
  const [openedAt] = useState(() => Date.now())
  const configuredPrice = priceHistory
    ?.filter(p => new Date(p.effectiveFrom).getTime() <= openedAt)
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0]
    ?.pricePerUnit ?? null
  const [appliedPrice, setAppliedPrice] = useState<number | null>(null)
  if (configuredPrice != null && configuredPrice !== appliedPrice) {
    setAppliedPrice(configuredPrice)
    setForm(f => ({ ...f, sellingPricePerUnit: configuredPrice }))
  }

  const { data: creditClients = [] } = useQuery({
    queryKey: ['creditClients', pumpId],
    queryFn: () => pumpApi.getCreditClients(pumpId),
    enabled: form.paymentMode === 'CREDIT',
  })

  const saleMutation = useMutation({
    mutationFn: (data: RecordAncillarySaleRequest) => ancillaryApi.recordSale(pumpId, data),
    onSuccess: (_, data) => {
      if (data.paymentMode === 'CREDIT') {
        queryClient.invalidateQueries({ queryKey: ['credit-ledger', pumpId] })
        queryClient.invalidateQueries({ queryKey: ['credit-transactions', pumpId] })
      }
      addToast(t('sell.recorded'), 'success')
      onSuccess()
    },
    onError: (err) => {
      const msg = parseApiError(err, t('sell.recordFailed'))
      setServerError(msg)
      addToast(msg, 'error')
    },
  })

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault()
    const errors: FieldErrors = {}
    if (!form.quantityUnits || form.quantityUnits < 1) errors.quantity = t('validation.quantityMin')
    if (!form.sellingPricePerUnit || form.sellingPricePerUnit <= 0) errors.price = t('sell.priceInvalid')
    if (form.paymentMode === 'CREDIT' && !form.clientId) errors.client = t('validation.creditClient')
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setServerError(null)
    setStep('review')
  }

  const buyPrice   = canSeeCost ? product.fifoCostPricePerUnit : null
  const sellPrice  = form.sellingPricePerUnit > 0 ? form.sellingPricePerUnit : null
  const hasQuantity = form.quantityUnits > 0
  const totalAmount = sellPrice != null && hasQuantity ? sellPrice * form.quantityUnits : null
  const stockAfter = product.currentStockUnits - form.quantityUnits

  // Walks FIFO lots in order so multi-batch sales are correct.
  // e.g. sell 6 from lots [5@100, 2@200] @ 120 → (120-100)×5 + (120-200)×1 = 20, not 120.
  const projectedProfit = (canSeeCost && sellPrice != null && hasQuantity)
    ? computeFifoProjectedProfit(form.quantityUnits, sellPrice, product.activeFifoLots)
    : null
  const profitLabel = projectedProfit == null ? null
    : projectedProfit > 0 ? t('sell.projectedProfit')
    : projectedProfit < 0 ? t('sell.projectedLoss')
    : t('sell.breakEven')
  const profitValue = projectedProfit == null ? null : (
    <MoneyText value={projectedProfit} showSign tone={projectedProfit < 0 ? 'bad' : undefined} />
  )

  const selectedClient = creditClients.find(c => c.id === form.clientId)
  const noPrice = !priceLoading && configuredPrice == null

  const figures: LiveFigure[] = [
    {
      label: t('sell.stockAfter'),
      value: hasQuantity
        ? <span className={stockAfter < 0 ? 'text-bad' : undefined}>{t('fields.quantityUnits', { count: stockAfter })}</span>
        : '—',
    },
    ...(profitLabel ? [{ label: profitLabel, value: profitValue }] : []),
    {
      label: (
        <>
          {t('common:fields.total')}
          {totalAmount != null && (
            <span className="ml-1.5 font-normal text-ink-3 tabular-nums">
              {t('sell.quantityTimesPrice', { count: form.quantityUnits, price: fmtCurrency(sellPrice) })}
            </span>
          )}
        </>
      ),
      value: <MoneyText value={totalAmount} />,
      isResult: true,
    },
  ]

  const stillNeeded = [
    ...(noPrice ? [t('sell.needPrice')] : []),
    ...(hasQuantity ? [] : [t('sell.needQuantity')]),
    ...(form.paymentMode === 'CREDIT' && !form.clientId ? [t('sell.needClient')] : []),
  ]

  const priceHelp = noPrice ? undefined : buyPrice != null
    ? t('sell.buyPriceHelp', { price: fmtCurrency(buyPrice) })
    : undefined

  return (
    <Modal
      tone="info"
      title={step === 'form' ? t('sell.title') : t('sell.reviewTitle')}
      subtitle={<span className="break-words">{product.displayName}</span>}
      size="lg"
      onClose={onClose}
      canClose={!saleMutation.isPending}
      onSubmit={step === 'form' ? handleProceedToReview : undefined}
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
            disabled={saleMutation.isPending} className="ui-btn ui-btn-secondary">
            {t('common:actions.edit')}
          </button>
          <LoadingButton
            type="button"
            isLoading={saleMutation.isPending}
            loadingLabel={t('actions.recording')}
            onClick={() => saleMutation.mutate(form)}
            className="ui-btn-primary"
          >
            {t('sell.confirm')}
          </LoadingButton>
        </>
      )}
    >
        {step === 'form' && (
          <>
            <FormGrid>
              <FormField
                label={t('fields.quantity')}
                error={fieldErrors.quantity}
                help={t('sell.inStock', { count: product.currentStockUnits })}
              >
                <NumericInput
                  unit={t('fields.unitsSuffix')}
                  min="1" step="1" data-autofocus inputMode="numeric"
                  value={form.quantityUnits || ''}
                  onChange={e => setForm(f => ({ ...f, quantityUnits: parseInt(e.target.value) || 0 }))}
                />
              </FormField>
              <FormField
                label={t('sell.sellingPrice')}
                error={fieldErrors.price ?? (noPrice ? t('sell.noPrice') : undefined)}
                help={priceHelp}
              >
                <NumericInput
                  unit="₹"
                  min="0.01" step="0.01"
                  value={form.sellingPricePerUnit || ''}
                  onChange={e => setForm(f => ({ ...f, sellingPricePerUnit: parseFloat(e.target.value) || 0 }))}
                  readOnly={!canOverridePrice}
                  disabled={configuredPrice == null}
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

              <FormField label={<>{t('fields.billNo')} <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span></>}>
                <input
                  value={form.billNo ?? ''}
                  onChange={e => setForm(f => ({ ...f, billNo: e.target.value || undefined }))}
                />
              </FormField>
            </FormGrid>

            <LiveFigures label={t('sell.liveLabel')} figures={figures} />

            {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
          </>
        )}

        {step === 'review' && (
          <>
            <ReviewList>
              <ReviewRow label={t('fields.product')} value={product.displayName} />
              <ReviewRow label={t('fields.quantity')} value={t('fields.quantityUnits', { count: form.quantityUnits })} />
              {buyPrice != null && <ReviewRow label={t('sell.buyPricePerUnit')} value={fmtCurrency(buyPrice)} />}
              <ReviewRow label={t('sell.sellPricePerUnit')} value={fmtCurrency(form.sellingPricePerUnit)} />
              {profitLabel && <ReviewRow label={profitLabel} value={profitValue} />}
              <ReviewRow label={t('sell.paymentModeRow')} value={<StatusBadge {...paymentModeBadge(form.paymentMode)} />} />
              {form.paymentMode === 'CREDIT' && selectedClient && (
                <ReviewRow label={t('fields.client')} value={selectedClient.name} />
              )}
              {form.billNo && <ReviewRow label={t('fields.billNo')} value={form.billNo} />}
              <ReviewRow label={t('common:fields.total')} value={<MoneyText value={totalAmount} />} isResult />
            </ReviewList>

            {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
          </>
        )}
    </Modal>
  )
}
