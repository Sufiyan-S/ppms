import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { NumericInput } from '../../components/NumericInput'
import { LoadingButton } from '../../components/LoadingButton'
import { MoneyText } from '../../components/AmountText'
import { parseApiError } from '../../utils/apiError'
import { formatCurrency } from '../../utils/format'
import { formatIstDateTime } from '../../utils/date'
import { parseSellingPrice } from './ancillaryFormat'
import { priceHistoryKey, useSetSellingPrice } from './useSetSellingPrice'

const HISTORY_ROWS = 5

/** Sets a product's selling price: today's price, the new one with how far it moves, and the last few prices. */
export function SetPriceDialog({
  pumpId, product, onClose,
}: {
  pumpId: number
  product: AncillaryProduct
  onClose: () => void
}) {
  const { t } = useTranslation(['ancillary', 'common'])
  const [priceText, setPriceText] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const currentPrice = product.currentSellingPricePerUnit
  const newPrice = parseSellingPrice(priceText)

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: priceHistoryKey(pumpId, product.id),
    queryFn: () => ancillaryApi.getPriceHistory(pumpId, product.id),
  })
  const mutation = useSetSellingPrice(pumpId, product.id, onClose)

  let changeLine: string | null = null
  if (newPrice != null) {
    if (currentPrice == null) {
      changeLine = t('setPrice.firstPrice')
    } else if (newPrice === currentPrice) {
      changeLine = t('setPrice.same', { current: formatCurrency(currentPrice) })
    } else {
      changeLine = t(newPrice > currentPrice ? 'setPrice.up' : 'setPrice.down', {
        amount: formatCurrency(Math.abs(newPrice - currentPrice)),
        current: formatCurrency(currentPrice),
      })
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newPrice == null) { setFieldError(t('setPrice.invalid')); return }
    setFieldError(null)
    mutation.mutate(newPrice)
  }

  return (
    <Modal
      tone="info"
      title={t('setPrice.title')}
      subtitle={<span className="break-words">{product.displayName}</span>}
      size="sm"
      onClose={onClose}
      canClose={!mutation.isPending}
      closeOnBackdropClick
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={<>
        <button type="button" onClick={onClose} disabled={mutation.isPending} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
        <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('common:actions.saving')} className="ui-btn-primary">
          {t('setPrice.save')}
        </LoadingButton>
      </>}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="ui-kpi-label">{t('setPrice.current')}</span>
        {currentPrice == null
          ? <span className="text-sm text-ink-3">{t('setPrice.notSet')}</span>
          : <span className="text-lg font-semibold text-ink tabular-nums"><MoneyText value={currentPrice} /></span>}
      </div>

      <FormField label={t('setPrice.newPrice')} error={fieldError ?? undefined} help={changeLine ?? t('setPrice.help')}>
        <NumericInput
          unit="₹"
          min="0.01"
          step="0.01"
          value={priceText}
          onChange={e => setPriceText(e.target.value)}
          data-autofocus
        />
      </FormField>

      {mutation.error && (
        <p role="alert" className="ui-alert ui-alert-danger">{parseApiError(mutation.error, t('setPrice.saveFailed'))}</p>
      )}

      <section aria-label={t('setPrice.history')} className="space-y-2">
        <h3 className="ui-kpi-label">{t('setPrice.history')}</h3>
        {historyLoading ? (
          <p className="text-sm text-ink-3">{t('setPrice.historyLoading')}</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-ink-3">{t('setPrice.historyEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border">
            {history.slice(0, HISTORY_ROWS).map(row => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-ink-2">{formatIstDateTime(row.effectiveFrom)}</span>
                <span className="font-medium text-ink tabular-nums"><MoneyText value={row.pricePerUnit} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Modal>
  )
}
