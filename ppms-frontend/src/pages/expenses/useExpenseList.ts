import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { expenseApi } from '../../api/expenseApi'
import type { ExpenseCategory, ExpenseApprovalStatus, PumpExpense } from '../../api/expenseApi'

const EXPORT_PAGE_SIZE = 200
const EXPORT_MAX_PAGES = 25

export function useExpenseList(pumpId: number | null) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | ''>('')
  const [statusFilter, setStatusFilter] = useState<ExpenseApprovalStatus | ''>('')

  const { data: expensesPage, isLoading } = useQuery({
    queryKey:  ['expenses', pumpId, page, pageSize, categoryFilter, statusFilter],
    queryFn:   () => expenseApi.getExpenses(
      pumpId!,
      page,
      pageSize,
      categoryFilter || undefined,
      statusFilter || undefined,
    ),
    enabled:   !!pumpId,
  })

  /** Every expense matching the current filters, for the CSV export. */
  const loadAllExpenses = async (): Promise<PumpExpense[]> => {
    const all: PumpExpense[] = []
    for (let exportPage = 0; exportPage < EXPORT_MAX_PAGES; exportPage++) {
      const result = await expenseApi.getExpenses(pumpId!, exportPage, EXPORT_PAGE_SIZE,
        categoryFilter || undefined, statusFilter || undefined)
      all.push(...result.content)
      if (!result.hasNext) break
    }
    return all
  }

  return {
    expensesPage,
    loadAllExpenses,
    expenses: expensesPage?.content ?? [],
    isLoading,
    setPage, setPageSize,
    categoryFilter, setCategoryFilter,
    statusFilter, setStatusFilter,
  }
}

export type ExpenseListState = ReturnType<typeof useExpenseList>
