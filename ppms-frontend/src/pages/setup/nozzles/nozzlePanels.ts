import { useQueryClient } from '@tanstack/react-query'

export type NozzlePanel = 'mapTank' | 'reading' | 'disable' | 'dip'

export function useInvalidateNozzles(pumpId: number) {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['dus', pumpId] })
    queryClient.invalidateQueries({ queryKey: ['myPumps'] })
  }
}
