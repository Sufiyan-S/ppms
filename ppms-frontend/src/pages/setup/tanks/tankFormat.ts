import { useQueryClient } from '@tanstack/react-query'
import { formatNumberIn } from '../../../i18n/format'

export function formatQuantity(value: number, unit: string): string {
  return `${formatNumberIn(value, { maximumFractionDigits: 2 })} ${unit}`
}

/** The typed amount as a readable quantity, or nothing until a positive number is typed. */
export function typedQuantity(value: string, unit: string): string | null {
  const amount = Number(value)
  return value.trim() !== '' && Number.isFinite(amount) && amount > 0 ? formatQuantity(amount, unit) : null
}

export function useInvalidateTanks(pumpId: number) {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['tanks', pumpId] })
    queryClient.invalidateQueries({ queryKey: ['tankStocks', pumpId] })
  }
}
