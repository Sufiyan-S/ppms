import type { CreditExtension } from '../../api/creditApi'
import { translateKey } from '../../i18n'
import { formatNumberIn } from '../../i18n/format'

export function extensionSummary(ext: CreditExtension) {
  switch (ext.extensionType) {
    case 'AMOUNT_EXTENSION': return translateKey('credit:extension.summary.amount', { amount: formatNumberIn(ext.extensionAmount ?? 0) })
    case 'BILLING_CYCLE_EXTENSION': return translateKey('credit:extension.summary.billingCycle')
    case 'OVERDUE_BLOCK_WAIVER': return translateKey('credit:extension.summary.overdueWaiver')
  }
}
