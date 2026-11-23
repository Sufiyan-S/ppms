import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { shiftApi } from '../../../api/shiftApi'
import type { ResolveDiscrepancyRequest } from '../../../api/shiftApi'
import type { Shift } from '../../../types/shift'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { parseApiError } from '../../../utils/apiError'
import { Modal } from '../../../components/Modal'
import { FormField } from '../../../components/FormField'
import { LiveFigures } from '../../../components/LiveFigures'
import { LoadingButton } from '../../../components/LoadingButton'
import { StillNeeded } from '../../../components/StillNeeded'
import { DiscrepancyBadge } from '../components/DiscrepancyBadge'
import { investigationLabel, resolutionChoices } from '../shiftLabels'

export function ResolveDiscrepancyModal({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const { t } = useTranslation(['shifts', 'common'])
  const qc = useQueryClient()
  const actionLabelId = useId()
  const stillNeededId = useId()
  const [action, setAction] = useState<ResolveDiscrepancyRequest['resolutionAction'] | ''>('')
  const [note,   setNote]   = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [error,  setError]  = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (req: ResolveDiscrepancyRequest) => shiftApi.resolveDiscrepancy(shift.pumpId, shift.id, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shiftHistory', shift.pumpId] })
      onClose()
    },
    onError: (err: unknown) => setError(parseApiError(err, t('resolveDiscrepancy.failed'))),
  })

  const noteRequired = action === 'WAIVED' || action === 'PENDING_INVESTIGATION'

  const handleSubmit = () => {
    setError(null)
    setNoteError(null)
    if (!action) {
      setError(t('resolveDiscrepancy.chooseAction'))
      return
    }
    if (action === 'WAIVED' && !note.trim()) {
      setNoteError(t('resolveDiscrepancy.waiveReason'))
      return
    }
    if (action === 'PENDING_INVESTIGATION' && !note.trim()) {
      setNoteError(t('resolveDiscrepancy.describeInvestigation'))
      return
    }
    mutation.mutate({ resolutionAction: action, resolutionNote: note.trim() || undefined })
  }

  const discType  = shift.discrepancyType
  const investigation = investigationLabel(shift)
  // Salary deduction and cash recovery both take money back from the operator, so they only apply to a shortage.
  const resolutionOptions = discType === 'SHORT'
    ? resolutionChoices()
    : resolutionChoices().filter(option => option.value !== 'SALARY_DEDUCTION' && option.value !== 'CASH_RECOVERY')
  const stillNeeded = action ? [] : [t('resolveDiscrepancy.stillNeededAction')]

  return (
    <tr>
      <td colSpan={8} className="p-0">
        <Modal
          title={t('resolveDiscrepancy.title')}
          subtitle={t('resolveDiscrepancy.subtitle', { id: shift.id, operator: shift.operatorName })}
          tone="success"
          size="md"
          onClose={onClose}
          canClose={!mutation.isPending}
          closeOnBackdropClick
          bodyClassName="space-y-4"
          footer={
            <>
              <StillNeeded id={stillNeededId} items={stillNeeded} />
              <button type="button" onClick={onClose} disabled={mutation.isPending} className="ui-btn ui-btn-secondary">
                {t('common:actions.cancel')}
              </button>
              <LoadingButton
                type="button"
                onClick={handleSubmit}
                disabled={!action}
                aria-describedby={action ? undefined : stillNeededId}
                isLoading={mutation.isPending}
                loadingLabel={t('common:actions.saving')}
                className="ui-btn-primary"
              >
                {action === 'PENDING_INVESTIGATION' ? t('resolveDiscrepancy.startInvestigation') : t('resolveDiscrepancy.confirm')}
              </LoadingButton>
            </>
          }
        >
          <LiveFigures
            figures={[
              {
                label: t('resolveDiscrepancy.difference'),
                value: discType === 'SHORT' || discType === 'OVER'
                  ? <DiscrepancyBadge type={discType} amount={shift.discrepancyAmount ?? 0} />
                  : <span className="text-ink-3">—</span>,
              },
              ...(shift.discrepancyReason
                ? [{ label: t('resolveDiscrepancy.reasonAtClose'), value: shift.discrepancyReason }]
                : []),
            ]}
          />
          {investigation && (
            <p className="ui-alert text-sm">
              {investigation}{shift.investigationNote ? ` — ${shift.investigationNote}` : ''}
            </p>
          )}
          <div>
            <span id={actionLabelId} className="ui-label">{t('resolveDiscrepancy.actionLabel')}</span>
            <SearchableSelect aria-labelledby={actionLabelId}
              value={action}
              onChange={(v) => { setAction(v as ResolveDiscrepancyRequest['resolutionAction']); setNoteError(null) }}
              options={resolutionOptions}
              placeholder={t('resolveDiscrepancy.choosePlaceholder')}
            />
            {action === 'PENDING_INVESTIGATION' && (
              <p className="ui-help">{t('resolveDiscrepancy.investigationHint')}</p>
            )}
          </div>
          <FormField
            label={noteRequired
              ? t('resolveDiscrepancy.note')
              : <>{t('resolveDiscrepancy.note')} <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span></>}
            error={noteError ?? undefined}
          >
            <textarea
              value={note}
              onChange={(e) => { setNote(e.target.value); setNoteError(null) }}
              rows={3}
              className="resize-none text-sm"
            />
          </FormField>
          {error && <p role="alert" className="ui-alert ui-alert-danger">{error}</p>}
        </Modal>
      </td>
    </tr>
  )
}
