import type { ExpenseCategory } from '../../api/expenseApi'

export const CATEGORIES: ExpenseCategory[] = ['FUEL', 'MAINTENANCE', 'SALARY', 'UTILITIES', 'EQUIPMENT', 'OTHER']

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  FUEL:        'bg-orange-100 text-orange-700',
  MAINTENANCE: 'bg-blue-100 text-blue-700',
  SALARY:      'bg-emerald-100 text-emerald-700',
  UTILITIES:   'bg-purple-100 text-purple-700',
  EQUIPMENT:   'bg-slate-100 text-slate-700',
  OTHER:       'bg-gray-100 text-gray-600',
}

export { formatIstDate as fmtDate } from '../../utils/date'
