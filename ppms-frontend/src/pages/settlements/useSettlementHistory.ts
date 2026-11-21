import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { paymentSettlementApi } from '../../api/paymentSettlementApi'
import type { SettlementPaymentType } from '../../api/paymentSettlementApi'
import { localDateInputValue } from '../../utils/date'

export function useSettlementHistory(pumpId: number | null) {
  const [typeFilter, setTypeFilter] = useState<SettlementPaymentType | ''>('')

  // Date range filter for the history — defaults to last 7 days
  const [filterFrom, setFilterFrom] = useState(() => localDateInputValue(-7))
  const [filterTo, setFilterTo]     = useState(() => localDateInputValue(0))
  const [summaryPage, setSummaryPage]         = useState(0)
  const [summaryPageSize, setSummaryPageSize] = useState(10)

  const { data: dailySummaryPage, isLoading: loadingList, isFetching: fetchingList, dataUpdatedAt: listUpdatedAt } = useQuery({
    queryKey: ['settlements-daily', pumpId, filterFrom, filterTo, summaryPage, summaryPageSize],
    queryFn:  () => paymentSettlementApi.getDailySummary(pumpId!, filterFrom, filterTo, summaryPage, summaryPageSize),
    enabled:  !!pumpId && !!filterFrom && !!filterTo,
  })

  return {
    typeFilter, setTypeFilter,
    filterFrom, setFilterFrom,
    filterTo, setFilterTo,
    summaryPage, setSummaryPage,
    summaryPageSize, setSummaryPageSize,
    dailySummaryPage,
    dailySummary: dailySummaryPage?.content ?? [],
    loadingList, fetchingList, listUpdatedAt,
  }
}

export type SettlementHistory = ReturnType<typeof useSettlementHistory>
