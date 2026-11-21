import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cashApi } from '../../api/cashApi'
import type { CashEventType } from '../../api/cashApi'

export function useCashEvents(pumpId: number | null) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [eventTypeFilter, setEventTypeFilter] = useState<CashEventType | ''>('')
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')

  const { data: cashData, isLoading, error: cashError } = useQuery({
    queryKey:  ['cashEvents', pumpId, page, pageSize, eventTypeFilter, fromDate, toDate],
    queryFn:   () => cashApi.getCashEvents(pumpId!, page, pageSize, eventTypeFilter || undefined, fromDate || undefined, toDate || undefined),
    enabled:   !!pumpId,
  })

  return {
    cashData, isLoading, cashError,
    filteredEvents: cashData?.events?.content ?? [],
    setPage, setPageSize,
    eventTypeFilter, setEventTypeFilter,
    fromDate, setFromDate,
    toDate, setToDate,
  }
}

export type CashEventsState = ReturnType<typeof useCashEvents>
