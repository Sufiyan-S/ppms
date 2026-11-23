import { useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { codeLabel } from '../../../constants/labels'
import { useTranslation } from 'react-i18next'
import { useOnValuesChange } from '../../../hooks/useOnValuesChange'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { inventoryApi } from '../../../api/inventoryApi'
import { tankerApi } from '../../../api/tankerApi'
import type { Tanker } from '../../../api/tankerApi'
import type { TankStock, RecordBatchDeliveryRequest } from '../../../api/inventoryApi'
import { localDateInputValue } from '../../../utils/date'
import { Modal } from '../../../components/Modal'
import { LitresText, MoneyText } from '../../../components/AmountText'
import { FormField } from '../../../components/FormField'
import { LiveFigures } from '../../../components/LiveFigures'
import type { LiveFigure } from '../../../components/LiveFigures'
import { StillNeeded } from '../../../components/StillNeeded'
import { FormGrid } from '../../../components/layout/FormGrid'
import { parseApiError } from '../../../utils/apiError'
import { useToastStore } from '../../../store/toastStore'
import { limitDecimals } from '../inventoryFormat'
import { _rowSeq, newRow } from './deliveryRows'
import type { DeliveryRow, PreparedDeliveryItem } from './deliveryRows'
import { DeliveryRowEditor } from './DeliveryRowEditor'
import { DeliveryHeaderFields } from './DeliveryHeaderFields'
import { DeliveryReviewDialog } from './DeliveryReviewDialog'
import { NumericInput } from '../../../components/NumericInput'
import { formatNumberIn } from '../../../i18n/format'

export function RecordDeliveryModal({
  pumpId,
  tanks,
  isOwnerOrAdmin,
  canSetBillTotal,
  onClose,
}: {
  pumpId: number
  tanks: TankStock[]
  isOwnerOrAdmin: boolean
  canSetBillTotal: boolean
  onClose: () => void
}) {
  const { t } = useTranslation(['inventory', 'common'])
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const defaultTankId = tanks[0]?.tankId ? String(tanks[0].tankId) : ''
  const stillNeededId = useId()
  const totalsHeadingId = useId()

  const { data: tankers = [] } = useQuery<Tanker[]>({
    queryKey: ['tankers', pumpId],
    queryFn: () => tankerApi.getTankers(pumpId),
  })

  const [date,              setDate]              = useState(localDateInputValue())
  const [invoice,           setInvoice]           = useState('')
  const [rows,              setRows]              = useState<DeliveryRow[]>([newRow(defaultTankId)])
  const [expandedRowId,     setExpandedRowId]     = useState<number | null>(() => _rowSeq)
  const [error,             setError]             = useState<string | null>(null)
  const [reviewOpen,        setReviewOpen]        = useState(false)
  const [billTotalStr,      setBillTotalStr]      = useState('')
  const [billTotalManual,   setBillTotalManual]   = useState(false)
  const [selectedTankerId,  setSelectedTankerId]  = useState<number | null>(
    () => tankers.find(t => t.defaultTanker)?.id ?? null
  )

  const mutation = useMutation({
    mutationFn: (req: RecordBatchDeliveryRequest) =>
      inventoryApi.recordBatchDelivery(pumpId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pumpId] })
      queryClient.invalidateQueries({ queryKey: ['deliveries', pumpId] })
      addToast(t('recordDelivery.recorded'), 'success')
      onClose()
    },
    onError: (err) =>
      setError(parseApiError(err, t('recordDelivery.failed'))),
  })

  const updateRow = (id: number, field: keyof Omit<DeliveryRow, 'id'>, value: string) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))

  const addRow = () => {
    const r = newRow(defaultTankId)
    setRows(prev => [...prev, r])
    setExpandedRowId(r.id)
  }

  const removeRow = (id: number) => {
    setRows(prev => prev.filter(r => r.id !== id))
    if (expandedRowId === id) setExpandedRowId(null)
  }

  const grandTotal = isOwnerOrAdmin
    ? rows.reduce((sum, r) => {
        const q = parseFloat(r.qty) || 0
        const c = parseFloat(r.costPrice) || 0
        return sum + q * c
      }, 0)
    : 0

  const defaultTankerId = tankers.find(t => t.defaultTanker)?.id ?? null
  useOnValuesChange([defaultTankerId], () => {
    if (defaultTankerId !== null && selectedTankerId === null) setSelectedTankerId(defaultTankerId)
  })

  const billTotalText = billTotalManual ? billTotalStr : (grandTotal > 0 ? grandTotal.toFixed(2) : '')
  const billTotalNum = parseFloat(billTotalText) || 0
  const otherCharges = billTotalNum - grandTotal

  const selectedTanker = tankers.find(t => t.id === selectedTankerId) ?? null
  const totalEnteredQty = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0)
  const tankerRemaining = selectedTanker ? selectedTanker.capacityLitres - totalEnteredQty : null
  const tankerMismatch = selectedTanker !== null && Math.abs(totalEnteredQty - selectedTanker.capacityLitres) > 0.01

  const anyTankOverflow = rows.some(r => {
    const tank = tanks.find(tk => tk.tankId === Number(r.tankId))
    const q = parseFloat(r.qty) || 0
    return tank && tank.capacity > 0 && q > 0 && q > (tank.capacity - tank.currentStock)
  })

  const buildPreparedItems = (): { items: PreparedDeliveryItem[] | null; error: string | null } => {
    if (!date || !invoice.trim()) {
      return { items: null, error: t('recordDelivery.dateAndInvoiceRequired') }
    }

    for (const r of rows) {
      if (!r.tankId) return { items: null, error: t('recordDelivery.selectTankEveryRow') }
      const q = parseFloat(r.qty)
      if (!r.qty || isNaN(q) || q <= 0) return { items: null, error: t('recordDelivery.quantityEveryRow') }
      const rowTank = tanks.find(tk => tk.tankId === Number(r.tankId))
      if (rowTank && rowTank.capacity > 0) {
        const availableSpace = rowTank.capacity - rowTank.currentStock
        if (q > availableSpace) {
          return {
            items: null,
            error: t('recordDelivery.exceedsSpace', {
              tank: rowTank.tankIdentifier,
              quantity: formatNumberIn(q, { minimumFractionDigits: 1 }),
              space: formatNumberIn(availableSpace, { minimumFractionDigits: 1 }),
            }),
          }
        }
      }
      if (isOwnerOrAdmin) {
        const c = parseFloat(r.costPrice)
        if (!r.costPrice || isNaN(c) || c <= 0) return { items: null, error: t('recordDelivery.costEveryRow') }
      }
    }

    const selectedTankIds = rows.map(r => r.tankId)
    const unique = new Set(selectedTankIds)
    if (unique.size !== selectedTankIds.length) {
      return { items: null, error: t('recordDelivery.duplicateTank') }
    }

    const preparedItems = rows.map((r) => {
      const tank = tanks.find(tk => tk.tankId === Number(r.tankId))
      if (!tank) {
        throw new Error('Selected tank not found.')
      }

      const quantityDelivered = parseFloat(r.qty)
      const costPricePerUnit = isOwnerOrAdmin ? parseFloat(r.costPrice) : 0

      return {
        tankId: tank.tankId,
        tankIdentifier: tank.tankIdentifier,
        fuelType: tank.fuelType,
        quantityDelivered,
        costPricePerUnit,
        totalCost: isOwnerOrAdmin ? quantityDelivered * costPricePerUnit : 0,
        stockAfter: tank.currentStock + quantityDelivered,
        capacity: tank.capacity,
      }
    })

    return { items: preparedItems, error: null }
  }

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      const { items, error } = buildPreparedItems()
      if (error || !items) {
        setError(error)
        return
      }

      setReviewOpen(true)
    } catch {
      setError(t('recordDelivery.tankNotFound'))
      return
    }
  }

  const handleConfirmSubmit = () => {
    try {
      const { items, error } = buildPreparedItems()
      if (error || !items) {
        setError(error)
        return
      }

      mutation.mutate({
        deliveryDate:     date,
        invoiceReference: invoice.trim(),
        billTotal: canSetBillTotal && billTotalNum > 0 ? billTotalNum : null,
        tankerId: selectedTankerId ?? null,
        items: items.map(item => ({
          tankId: item.tankId,
          quantityDelivered: item.quantityDelivered,
          costPricePerUnit: isOwnerOrAdmin ? item.costPricePerUnit : null,
        })),
      })
    } catch {
      setError(t('recordDelivery.tankNotFound'))
    }
  }

  const tankOptions = tanks.map(tank => ({
    value: String(tank.tankId),
    label: t('recordDelivery.tankOption', { tank: tank.tankIdentifier, fuel: codeLabel(tank.fuelType), stock: tank.currentStock.toFixed(0) }),
  }))


  const stillNeeded = [
    ...(tankerMismatch ? [t('recordDelivery.mustEqualTanker', { capacity: formatNumberIn(selectedTanker?.capacityLitres ?? 0) })] : []),
    ...(anyTankOverflow ? [t('recordDelivery.tankOverflow')] : []),
  ]

  const totalFigures: LiveFigure[] = [
    { label: t('recordDelivery.totalQuantity'), value: <LitresText value={totalEnteredQty > 0 ? totalEnteredQty : null} decimals={1} /> },
    ...(isOwnerOrAdmin ? [{
      label: t('recordDelivery.calculatedTotal', { count: rows.length }),
      value: <MoneyText value={grandTotal > 0 ? grandTotal : null} />,
      isResult: !canSetBillTotal,
    }] : []),
    ...(isOwnerOrAdmin && canSetBillTotal && billTotalManual && otherCharges !== 0 ? [{
      label: t('recordDelivery.otherCharges'),
      value: <MoneyText value={otherCharges} showSign />,
      isResult: true,
    }] : []),
  ]

  return (
    <>
    <Modal
      title={t('recordDelivery.title')}
      subtitle={t('recordDelivery.subtitle')}
      tone="info"
      size="lg"
      onClose={onClose}
      closeOnBackdropClick
      fullScreenOnPhone
      onSubmit={handleReview}
      bodyClassName="space-y-4"
      footerClassName="flex-wrap"
      footer={<>
        {error && <p role="alert" className="ui-alert ui-alert-danger basis-full">{error}</p>}
        <StillNeeded id={stillNeededId} items={stillNeeded} />
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
        <button
          type="submit"
          disabled={mutation.isPending || stillNeeded.length > 0}
          aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
          className="ui-btn ui-btn-primary"
        >
          {t('recordDelivery.review')}
        </button>
      </>}
    >
      <DeliveryHeaderFields
        date={date}
        setDate={setDate}
        invoice={invoice}
        setInvoice={setInvoice}
        tankers={tankers}
        selectedTanker={selectedTanker}
        selectedTankerId={selectedTankerId}
        setSelectedTankerId={setSelectedTankerId}
        tankerMismatch={tankerMismatch}
        tankerRemaining={tankerRemaining}
        totalEnteredQty={totalEnteredQty}
      />

      {rows.map((row, idx) => (
        <DeliveryRowEditor
          key={row.id}
          row={row}
          rowNumber={idx + 1}
          tanks={tanks}
          tankOptions={tankOptions}
          isOwnerOrAdmin={isOwnerOrAdmin}
          isExpanded={expandedRowId === row.id}
          onExpandedChange={setExpandedRowId}
          canRemove={rows.length > 1}
          onRemove={() => removeRow(row.id)}
          onChange={(field, value) => updateRow(row.id, field, value)}
        />
      ))}

      <button type="button" onClick={addRow} className="ui-btn ui-btn-secondary w-full">
        <Plus size={16} aria-hidden="true" />
        {t('recordDelivery.addTank')}
      </button>

      <section aria-labelledby={totalsHeadingId} className="space-y-3 border-t border-border pt-4">
        <h3 id={totalsHeadingId} className="text-sm font-semibold text-ink">{t('recordDelivery.totals')}</h3>
        {canSetBillTotal && (
          <FormGrid>
            <FormField
              label={t('recordDelivery.billAmount')}
              help={isOwnerOrAdmin ? t('recordDelivery.billAmountHelp') : t('recordDelivery.supplierInvoiceNote')}
            >
              <NumericInput
                step="0.01"
                min="0.01"
                unit="₹"
                value={billTotalText}
                onChange={e => { setBillTotalStr(limitDecimals(e.target.value, 2)); setBillTotalManual(true) }}
                onBlur={() => { if (!billTotalText.trim()) setBillTotalManual(false) }}
              />
            </FormField>
          </FormGrid>
        )}
        <LiveFigures label={t('recordDelivery.totals')} figures={totalFigures} />
      </section>
    </Modal>
      {reviewOpen && (() => {
        try {
          const { items } = buildPreparedItems()
          if (!items) return null

          return (
        <DeliveryReviewDialog
          items={items}
          date={date}
          invoice={invoice}
          error={error}
          isOwnerOrAdmin={isOwnerOrAdmin}
          canSetBillTotal={canSetBillTotal}
          billTotalManual={billTotalManual}
          billTotalNum={billTotalNum}
          otherCharges={otherCharges}
          isPending={mutation.isPending}
          onBack={() => setReviewOpen(false)}
          onConfirm={handleConfirmSubmit}
        />
          )
        } catch {
          return null
        }
      })()}
    </>
  )
}
