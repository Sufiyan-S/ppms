import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct, AncillaryLotDetail, UpdateLotRequest } from '../../api/ancillaryApi'
import { LoadingButton } from '../../components/LoadingButton'
import { NumericInput } from '../../components/NumericInput'
import { useToastStore } from '../../store/toastStore'
import { SidePanel } from '../../components/layout/SidePanel'
import { DataTable } from '../../components/DataTable'
import type { DataTableColumn } from '../../components/DataTable'
import { MoneyText } from '../../components/AmountText'
import { parseApiError } from '../../utils/apiError'
import { fmtDate } from './ancillaryFormat'

/**
 * Shows all ACTIVE FIFO lots for a product in consumption order (oldest first).
 * Each row shows: In Date, Bill No, Cost Price/unit, Remaining, Original.
 * Owner/Admin can edit remaining quantity and cost price inline per row.
 * Editing remaining quantity automatically adjusts product.currentStockUnits on the backend.
 */
export function StockLotsPanel({
  pumpId, product, isOwnerOrAdmin, onClose, onUpdated,
}: {
  pumpId: number
  product: AncillaryProduct
  isOwnerOrAdmin: boolean
  onClose: () => void
  onUpdated: () => void
}) {
  const { t } = useTranslation(['ancillary', 'common'])
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [editingLotId, setEditingLotId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<{ costPricePerUnit: string; remainingQuantity: string }>({
    costPricePerUnit: '',
    remainingQuantity: '',
  })
  const [editError, setEditError] = useState<string | null>(null)

  const { data: lots = [], isLoading } = useQuery<AncillaryLotDetail[]>({
    queryKey: ['ancillaryLots', pumpId, product.id],
    queryFn:  () => ancillaryApi.getLots(pumpId, product.id),
  })

  const updateMutation = useMutation({
    mutationFn: ({ lotId, data }: { lotId: number; data: UpdateLotRequest }) =>
      ancillaryApi.updateLot(pumpId, lotId, data),
    onSuccess: () => {
      setEditingLotId(null)
      setEditError(null)
      qc.invalidateQueries({ queryKey: ['ancillaryLots', pumpId, product.id] })
      addToast(t('lots.updated'), 'success')
      onUpdated()
    },
    onError: (err) => {
      const msg = parseApiError(err, t('lots.updateFailed'))
      setEditError(msg)
      addToast(msg, 'error')
    },
  })

  const startEdit = (lot: AncillaryLotDetail) => {
    setEditingLotId(lot.id)
    setEditForm({
      costPricePerUnit: lot.costPricePerUnit.toString(),
      remainingQuantity: lot.remainingQuantity.toString(),
    })
    setEditError(null)
  }

  const handleSave = (lot: AncillaryLotDetail) => {
    const newCost = parseFloat(editForm.costPricePerUnit)
    const newQty  = parseInt(editForm.remainingQuantity, 10)
    if (isNaN(newCost) || newCost <= 0) { setEditError(t('lots.costPositive')); return }
    if (isNaN(newQty)  || newQty  <  0) { setEditError(t('lots.remainingNegative')); return }
    if (newQty > lot.originalQuantity)  { setEditError(t('lots.remainingExceeds', { original: lot.originalQuantity })); return }

    const payload: UpdateLotRequest = {}
    if (newCost !== lot.costPricePerUnit)  payload.costPricePerUnit  = newCost
    if (newQty  !== lot.remainingQuantity) payload.remainingQuantity = newQty
    if (Object.keys(payload).length === 0) { setEditingLotId(null); return }

    updateMutation.mutate({ lotId: lot.id, data: payload })
  }

  const columns: DataTableColumn<AncillaryLotDetail>[] = [
    { key: 'inDate', header: t('lots.inDate') },
    { key: 'billNo', header: t('fields.billNo') },
    { key: 'costPrice', header: t('lots.costPrice'), numeric: true },
    { key: 'remaining', header: t('lots.remaining'), numeric: true },
    { key: 'original', header: t('lots.original'), numeric: true },
    ...(isOwnerOrAdmin ? [{ key: 'actions', header: t('lots.actions'), align: 'right' as const }] : []),
  ]

  return (
    <SidePanel
      title={t('lots.title')}
      subtitle={<span className="block truncate">{product.displayName}</span>}
      size="lg"
      onClose={onClose}
      footerClassName="justify-between items-center"
      footer={<>
        <p className="text-xs text-ink-3">
          {t('lots.fifoNote')}
        </p>
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
          {t('common:actions.close')}
        </button>
      </>}
    >
          {isLoading ? (
            <p className="ui-empty py-8">{t('lots.loading')}</p>
          ) : lots.length === 0 ? (
            <p className="ui-empty py-8">{t('lots.empty')}</p>
          ) : (
            <>
              {editError && (
                <div role="alert" className="ui-alert ui-alert-danger mb-3 text-sm">{editError}</div>
              )}
              <DataTable
                caption={t('lots.caption')}
                captionHidden
                columns={columns}
                rows={lots}
                rowKey={(lot) => lot.id}
                renderRow={(lot) => (
                    <tr>
                      {editingLotId === lot.id ? (
                        <>
                          <td className="text-ink">{fmtDate(lot.deliveryDate)}</td>
                          <td className="text-ink-3">{lot.invoiceReference ?? '—'}</td>
                          <td className="text-right">
                            <div className="ml-auto w-32">
                              <NumericInput aria-label={t('lots.costAria')}
                                unit="₹"
                                min="0.01"
                                step="0.01"
                                value={editForm.costPricePerUnit}
                                onChange={e => setEditForm(f => ({ ...f, costPricePerUnit: e.target.value }))}
                              />
                            </div>
                          </td>
                          <td className="text-right">
                            <div className="ml-auto w-32">
                              <NumericInput aria-label={t('lots.remainingAria')}
                                unit={t('fields.unitsSuffix')}
                                min="0"
                                max={lot.originalQuantity}
                                step="1"
                                inputMode="numeric"
                                value={editForm.remainingQuantity}
                                onChange={e => setEditForm(f => ({ ...f, remainingQuantity: e.target.value }))}
                              />
                            </div>
                          </td>
                          <td className="text-right text-ink-3">{lot.originalQuantity}</td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <LoadingButton
                                type="button"
                                isLoading={updateMutation.isPending}
                                loadingLabel={t('common:actions.saving')}
                                onClick={() => handleSave(lot)}
                                className="ui-btn-primary ui-btn-compact"
                              >
                                {t('common:actions.save')}
                              </LoadingButton>
                              <button
                                type="button"
                                onClick={() => { setEditingLotId(null); setEditError(null) }}
                                className="ui-btn ui-btn-ghost ui-btn-compact"
                              >
                                {t('common:actions.cancel')}
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="text-ink">{fmtDate(lot.deliveryDate)}</td>
                          <td className="text-ink-3">{lot.invoiceReference ?? '—'}</td>
                          <td className="text-right"><MoneyText value={lot.costPricePerUnit} className="font-medium text-ink" /></td>
                          <td className="text-right">
                            <span className="font-semibold text-ink">{lot.remainingQuantity}</span>
                          </td>
                          <td className="text-right text-ink-3">{lot.originalQuantity}</td>
                          {isOwnerOrAdmin && (
                            <td className="text-right">
                              <button
                                type="button"
                                onClick={() => startEdit(lot)}
                                className="ui-btn ui-btn-ghost ui-btn-compact"
                              >
                                {t('common:actions.edit')}
                              </button>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                )}
              />
            </>
          )}
    </SidePanel>
  )
}
