
// ── Post-close "Open new shift?" prompt ──────────────────────────────────────

export function OpenNewShiftPrompt({ onConfirm, onDismiss }: { onConfirm: () => void; onDismiss: () => void }) {
  return (
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel w-full max-w-sm p-6 space-y-4 text-center">
        <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-800">Shift closed successfully</h2>
          <p className="text-sm text-slate-500 mt-1">Do you want to open a new shift now?</p>
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onDismiss} className="ui-btn ui-btn-secondary flex-1">Not now</button>
          <button type="button" onClick={onConfirm} className="ui-btn ui-btn-primary flex-1">Open new shift</button>
        </div>
      </div>
    </div>
  )
}
