import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProductPrice } from '../../api/ancillaryApi'
import { useToastStore } from '../../store/toastStore'
import { formatCurrency } from '../../utils/format'

export const priceHistoryKey = (pumpId: number, productId: number) => ['ancillary-price-history', pumpId, productId] as const

/** Saves a new selling price, puts it at the top of the cached price history and refreshes the product list. */
export function useSetSellingPrice(pumpId: number, productId: number, onSaved: (price: AncillaryProductPrice) => void) {
  const { t } = useTranslation('ancillary')
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()

  return useMutation({
    mutationFn: (pricePerUnit: number) => ancillaryApi.setPrice(pumpId, productId, { pricePerUnit }),
    onSuccess: (price) => {
      queryClient.setQueryData<AncillaryProductPrice[]>(priceHistoryKey(pumpId, productId), (history = []) => [price, ...history])
      queryClient.invalidateQueries({ queryKey: priceHistoryKey(pumpId, productId) })
      queryClient.invalidateQueries({ queryKey: ['ancillaryProducts', pumpId] })
      addToast(t('setPrice.saved', { price: formatCurrency(price.pricePerUnit) }), 'success')
      onSaved(price)
    },
  })
}
