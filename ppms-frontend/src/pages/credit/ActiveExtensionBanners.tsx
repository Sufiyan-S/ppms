import type { CreditExtension } from '../../api/creditApi'

export function ActiveExtensionBanners({ extensions }: { extensions: CreditExtension[] }) {
  return extensions.map((ext) => (
    <div key={ext.id} className="mt-3 ui-alert text-sm bg-blue-50 border-blue-200 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="font-medium text-blue-800">
          {ext.extensionType === 'AMOUNT_EXTENSION' && `+₹${ext.extensionAmount?.toLocaleString('en-IN')} credit headroom`}
          {ext.extensionType === 'BILLING_CYCLE_EXTENSION' && 'Billing cycle overdue block deferred'}
          {ext.extensionType === 'OVERDUE_BLOCK_WAIVER' && 'Overdue block waived'}
        </span>
        <span className="text-xs text-blue-700">expires {ext.expiryDate}</span>
      </div>
      <span className="text-xs text-blue-700 italic truncate max-w-xs">{ext.reason}</span>
    </div>
  ))
}
