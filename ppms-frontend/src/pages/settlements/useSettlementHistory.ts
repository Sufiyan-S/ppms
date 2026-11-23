import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { paymentSettlementApi } from '../../api/paymentSettlementApi'
import type { SettlementPaymentType } from '../../api/paymentSettlementApi'
import { localDateInputValue } from '../../utils/date'
import { useDateRangeParams } from '../../hooks/useDateRangeParams'
import type { DateRange } from '../../utils/datePresets'

const FULL_RANGE_DAYS = 200

export function useSettlementHistory(pumpId: number | null) {
  const [typeFilter, setTypeFilter] = useState<SettlementPaymentType | ''>('')

  // Date range filter for the history, kept in the address — defaults to last 7 days
  const [range, setRangeParams] = useDateRangeParams(() => ({ from: localDateInputValue(-7), to: localDateInputValue(0) }))
  const { from: filterFrom, to: filterTo } = range
  const [summaryPage, setSummaryPage]         = useState(0)
  const setRange = (next: DateRange) => { setRangeParams(next); setSummaryPage(0) }
  const setFilterFrom = (from: string) => setRange({ from, to: filterTo })
  const setFilterTo = (to: string) => setRange({ from: filterFrom, to })
  const loadAllDays = async () =>
    (await paymentSettlementApi.getDailySummary(pumpId!, filterFrom, filterTo, 0, FULL_RANGE_DAYS)).content
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
    setRange,
    loadAllDays,
    summaryPage, setSummaryPage,
    summaryPageSize, setSummaryPageSize,
    dailySummaryPage,
    dailySummary: dailySummaryPage?.content ?? [],
    loadingList, fetchingList, listUpdatedAt,
  }
}

export type SettlementHistory = ReturnType<typeof useSettlementHistory>
