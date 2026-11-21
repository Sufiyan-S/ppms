import { ModalPortal } from './ModalPortal'

interface DiscardChangesDialogProps {
  onDiscard: () => void
  onKeepEditing: () => void
}

/** In-app replacement for window.confirm when a form with entered details is about to be closed. */
export function DiscardChangesDialog({ onDiscard, onKeepEditing }: DiscardChangesDialogProps) {
  return (
    <ModalPortal onClose={onKeepEditing}>
      <div className="ui-modal-backdrop">
        <div className="ui-modal-panel max-w-sm">
          <div className="ui-modal-body space-y-2">
            <h2 className="ui-modal-title">Discard what you entered?</h2>
            <p className="text-sm text-slate-600">The details you have typed in this form will be lost.</p>
          </div>
          <div className="ui-modal-footer">
            <button type="button" data-autofocus onClick={onKeepEditing} className="ui-btn ui-btn-secondary">Keep editing</button>
            <button type="button" onClick={onDiscard} className="ui-btn ui-btn-danger">Discard</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
