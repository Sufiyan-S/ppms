import { useState } from 'react'
import { codeLabel } from '../../constants/labels'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { inventoryApi } from '../../api/inventoryApi'
import type { TankerDelivery, UpdateDeliveryRequest } from '../../api/inventoryApi'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { NumericInput } from '../../components/NumericInput'
import { LoadingButton } from '../../components/LoadingButton'
import { LiveFigures } from '../../components/LiveFigures'
import { MoneyText } from '../../components/AmountText'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'
import { parseApiError } from '../../utils/apiError'
import { limitDecimals } from './inventoryFormat'

type Field = 'invoice' | 'quantity' | 'cost' | 'date'

export function EditDeliveryModal({ delivery, pumpId, isOwnerOrAdmin, onClose }: {
  delivery: TankerDelivery
  pumpId: number
  isOwnerOrAdmin: boolean
  onClose: () => void
}) {
  const { t } = useTranslation(['inventory', 'common'])
  const qc = useQueryClient()
  const [invoiceReference, setInvoiceReference] = useState(delivery.invoiceReference)
  const [qty,   setQty]   = useState(String(delivery.quantityDelivered))
  const [cost,  setCost]  = useState(String(delivery.costPricePerUnit))
  const [date,  setDate]  = useState(delivery.deliveryDate.slice(0, 10))
  const [fieldError, setFieldError] = useState<{ field: Field; message: string } | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (req: UpdateDeliveryRequest) => inventoryApi.updateDelivery(pumpId, delivery.id, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries', pumpId] })
      qc.invalidateQueries({ queryKey: ['tankStocks', pumpId] })
      onClose()
    },
    onError: (err: unknown) => setServerError(parseApiError(err, t('editDelivery.failed'))),
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    const q = parseFloat(qty)
    if (!invoiceReference.trim()) { setFieldError({ field: 'invoice', message: t('editDelivery.invoiceRequired') }); return }
    if (isNaN(q) || q <= 0) { setFieldError({ field: 'quantity', message: t('editDelivery.quantityPositive') }); return }
    if (isOwnerOrAdmin) {
      const c = parseFloat(cost)
      if (isNaN(c) || c <= 0) { setFieldError({ field: 'cost', message: t('editDelivery.costPositive') }); return }
    }
    if (!date) { setFieldError({ field: 'date', message: t('editDelivery.dateRequired') }); return }
    setFieldError(null)
    mutation.mutate({
      invoiceReference: invoiceReference.trim(),
      quantityDelivered: q,
      costPricePerUnit: isOwnerOrAdmin ? parseFloat(cost) : null,
      deliveryDate: date,
    })
  }

  const errorFor = (field: Field) => fieldError?.field === field ? fieldError.message : undefined
  const newQty = parseFloat(qty)
  const newCost = parseFloat(cost)
  const newAmount = newQty > 0 && newCost > 0 ? newQty * newCost : null

  return (
    <Modal
      title={t('editDelivery.title')}
      subtitle={`${delivery.tankIdentifier} · ${codeLabel(delivery.fuelType)}`}
      tone="info"
      onClose={onClose}
      canClose={!mutation.isPending}
      closeOnBackdropClick
      onSubmit={handleSave}
      bodyClassName="space-y-4"
      footer={<>
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">{t('common:actions.cancel')}</button>
        <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('common:actions.saving')} className="ui-btn-primary">
          {t('editDelivery.save')}
        </LoadingButton>
      </>}
    >
      <FormGrid>
        <FormField label={t('editDelivery.invoice')} error={errorFor('invoice')}>
          <input value={invoiceReference} onChange={e => setInvoiceReference(e.target.value)} data-autofocus />
        </FormField>
        <FormField label={t('editDelivery.date')} error={errorFor('date')}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </FormField>
        <FormField label={t('editDelivery.quantity')} error={errorFor('quantity')}
          className={isOwnerOrAdmin ? undefined : 'ui-form-grid__full'}>
          <NumericInput min="0.001" step="0.001" unit="L" value={qty}
            onChange={e => setQty(limitDecimals(e.target.value, 3))} />
        </FormField>
        {isOwnerOrAdmin ? (
          <FormField label={t('editDelivery.cost')} error={errorFor('cost')}>
            <NumericInput min="0.01" step="0.01" unit="₹/L" value={cost}
              onChange={e => setCost(limitDecimals(e.target.value, 2))} />
          </FormField>
        ) : (
          <FormGridFullRow><p className="ui-help mt-0">{t('editDelivery.costManaged')}</p></FormGridFullRow>
        )}
      </FormGrid>

      {isOwnerOrAdmin && (
        <LiveFigures
          label={t('editDelivery.amountLabel')}
          figures={[
            { label: t('editDelivery.amountBefore'), value: <MoneyText value={delivery.totalCost} /> },
            { label: t('editDelivery.amountAfter'), value: <MoneyText value={newAmount} />, isResult: true },
          ]}
        />
      )}

      {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
    </Modal>
  )
}
