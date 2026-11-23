import type { ExpenseCategory } from '../../api/expenseApi'

export const CATEGORIES: ExpenseCategory[] = ['FUEL', 'MAINTENANCE', 'SALARY', 'UTILITIES', 'EQUIPMENT', 'OTHER']

export { formatIstDate as fmtDate } from '../../utils/date'
