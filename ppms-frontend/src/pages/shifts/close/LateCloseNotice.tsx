export function LateCloseNotice({ scheduledEndDisplay }: { scheduledEndDisplay: string }) {
  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 4a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H10z" clipRule="evenodd" />
      </svg>
      <div>
        <p className="text-sm font-semibold text-amber-800">Shift close time adjusted</p>
        <p className="text-xs text-amber-700 mt-0.5">
          You are closing after the scheduled end. Close time will be recorded as{' '}
          <span className="font-semibold">{scheduledEndDisplay}</span> (your shift's scheduled end time).
        </p>
      </div>
    </div>
  )
}
