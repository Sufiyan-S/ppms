import { useEffect, useId, useRef } from 'react'
import { TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ModalDiscardConfirmProps {
  onKeepEditing: () => void
  onDiscard: () => void
}

/** Takes the footer's place while a dialog with unsaved changes asks whether to throw them away. */
export function ModalDiscardConfirm({ onKeepEditing, onDiscard }: ModalDiscardConfirmProps) {
  const { t } = useTranslation()
  const questionId = useId()
  const keepEditingRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    keepEditingRef.current?.focus()
  }, [])

  return (
    <div role="alertdialog" aria-labelledby={questionId} className="ui-modal-footer ui-modal-discard">
      <p id={questionId} className="ui-modal-discard__question">
        <TriangleAlert size={18} aria-hidden="true" className="shrink-0" />
        {t('modal.discardQuestion')}
      </p>
      <div className="ui-modal-discard__actions">
        <button ref={keepEditingRef} type="button" onClick={onKeepEditing} className="ui-btn ui-btn-secondary">
          {t('actions.keepEditing')}
        </button>
        <button type="button" onClick={onDiscard} className="ui-btn ui-btn-danger">{t('actions.discard')}</button>
      </div>
    </div>
  )
}
