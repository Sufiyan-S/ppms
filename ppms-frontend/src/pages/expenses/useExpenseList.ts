import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { expenseApi } from '../../api/expenseApi'
import type { ExpenseCategory, ExpenseApprovalStatus } from '../../api/expenseApi'

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

  return {
    expensesPage,
    expenses: expensesPage?.content ?? [],
    isLoading,
    setPage, setPageSize,
    categoryFilter, setCategoryFilter,
    statusFilter, setStatusFilter,
  }
}

export type ExpenseListState = ReturnType<typeof useExpenseList>
