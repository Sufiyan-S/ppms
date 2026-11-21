interface SuspendedPumpNoticeProps {
  canSwitchPump: boolean
}

export function SuspendedPumpNotice({ canSwitchPump }: SuspendedPumpNoticeProps) {
  return (
    <div className="p-6">
      <div role="alert" className="ui-card max-w-xl mx-auto text-center space-y-2">
        <h1 className="text-lg font-bold text-slate-800">This pump is suspended</h1>
        <p className="text-sm text-slate-600">
          Its data cannot be viewed or changed until the pump is reactivated.
          {canSwitchPump
            ? ' Choose another pump at the top of the page, or contact PPMS support to reactivate this one.'
            : ' Please contact the pump owner or PPMS support.'}
        </p>
      </div>
    </div>
  )
}
