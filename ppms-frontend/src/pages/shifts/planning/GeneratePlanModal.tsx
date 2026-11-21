import { ModalPortal } from '../../../components/ModalPortal'
import type { ShiftPlanning } from './useShiftPlanning'
import { IconButton } from '../../../components/IconButton'

export function GeneratePlanModal({ form }: { form: ShiftPlanning }) {
  const { showGenerate, setShowGenerate, genDayOps, setGenDayOps, genNightOps, setGenNightOps, genError, generateMutation } = form
  return (
    <>
      {showGenerate && (
        <ModalPortal onClose={() => setShowGenerate(false)}>
        <div className="ui-modal-backdrop">
          <div className="ui-modal-panel w-full max-w-sm">
            <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
              <div className="ui-modal-heading">
                <h3 className="ui-modal-title">Auto-generate Schedule</h3>
                <p className="ui-modal-subtitle">
                  The system will assign operators based on preferences, leave dates, and fairness.
                </p>
              </div>
              <IconButton label="Close" icon="×" onClick={() => setShowGenerate(false)} className="ui-btn ui-btn-ghost ui-modal-close" />
            </div>
            <div className="ui-modal-body space-y-3">
              <div>
                <label className="block">
                  <span className="ui-label">
                  Operators per Morning / Evening shift
                </span>
                  <input type="number" min="1" max="20" value={genDayOps}
                    onChange={e => setGenDayOps(e.target.value)}
                    className="w-24 text-sm"
                  />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="ui-label">
                  Operators per Night shift (12 AM – 8 AM)
                </span>
                  <input type="number" min="1" max="20" value={genNightOps}
                    onChange={e => setGenNightOps(e.target.value)}
                    className="w-24 text-sm"
                  />
                </label>
              </div>
            </div>
            <div className="ui-modal-body pt-0">
              {genError && <p role="alert" className="ui-error-text">{genError}</p>}
            </div>
            <div className="ui-modal-footer">
              <button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="ui-btn ui-btn-primary"
              >
                {generateMutation.isPending ? 'Generating…' : 'Generate'}
              </button>
              <button onClick={() => setShowGenerate(false)}
                className="ui-btn ui-btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  )
}
