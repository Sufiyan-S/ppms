import { Spinner } from '../../../components/Spinner'

interface Props {
  nozzleNumber: number
  error: string | null
  isPending: boolean
  onDisable: () => void
  onCancel: () => void
}

export function DisableNozzlePanel({ nozzleNumber, error, isPending, onDisable, onCancel }: Props) {
  return (
    <div className="px-4 py-3 border-t border-slate-100">
      <div className="ui-disable-editor">
        <div className="ui-disable-editor__hero">
          <div>
            <p className="ui-section-kicker mb-2">Maintenance Lock</p>
            <h3 className="ui-title-sm">Disable nozzle #{nozzleNumber}</h3>
            <p className="ui-subtitle mt-1">Take this nozzle offline for maintenance or operational issues.</p>
          </div>
        </div>
        <div className="ui-alert ui-alert-danger text-xs">
          No new shifts can be opened on this nozzle until it is re-enabled. Close any active shift first.
        </div>
        {error && <p role="alert" className="ui-error-text">{error}</p>}
        <div className="ui-disable-editor__actions">
          <button
            type="button"
            onClick={onDisable}
            disabled={isPending}
            className="ui-btn ui-btn-danger"
          >
            {isPending ? <span className="flex items-center gap-1.5"><Spinner className="w-3 h-3" />Disabling…</span> : 'Yes, Disable'}
          </button>
          <button type="button" onClick={onCancel} className="ui-btn ui-btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
