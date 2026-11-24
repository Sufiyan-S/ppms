import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { balanceSheetApi } from '../../api/balanceSheetApi'
import { useDateRangeParams } from '../../hooks/useDateRangeParams'
import { useOnValuesChange } from '../../hooks/useOnValuesChange'
import { localDateInputValue } from '../../utils/date'

/** The sheets in the chosen date range, one page at a time; the range lives in the address. */
export function useBalanceSheetList(pumpId: number | null) {
  const [filterRange, setFilterRange] = useDateRangeParams(() => ({ from: localDateInputValue(-7), to: localDateInputValue(0) }))
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  useOnValuesChange([filterRange.from, filterRange.to, pumpId], () => setPage(0))

  const query = useQuery({
    queryKey: ['balance-sheets', pumpId, filterRange.from, filterRange.to, page, pageSize],
    queryFn:  () => balanceSheetApi.list(pumpId!, filterRange.from || undefined, filterRange.to || undefined, page, pageSize),
    enabled: !!pumpId,
  })

  return {
    filterRange,
    setFilterRange,
    setPage,
    changePageSize: (size: number) => { setPageSize(size); setPage(0) },
    query,
  }
}

export type BalanceSheetList = ReturnType<typeof useBalanceSheetList>
