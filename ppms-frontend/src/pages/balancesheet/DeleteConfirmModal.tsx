import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { serverText } from '../../utils/serverText'
import { Trans, useTranslation } from 'react-i18next'
import { balanceSheetApi } from '../../api/balanceSheetApi'
import { parseApiError } from '../../utils/apiError'
import type { BalanceSheetSummary } from '../../api/balanceSheetApi'
import { LoadingButton } from '../../components/LoadingButton'
import { useToastStore } from '../../store/toastStore'
import { Modal } from '../../components/Modal'
import { fmtDate } from './bsFormat'

export type DeletableSheet = Pick<BalanceSheetSummary, 'id' | 'periodLabel' | 'periodLabelCode' | 'periodLabelParams' | 'reportDate'>

interface DeleteConfirmProps {
  report: DeletableSheet
  pumpId: number
  onClose: () => void
}

export function DeleteConfirmModal({ report, pumpId, onClose }: DeleteConfirmProps) {
  const { t } = useTranslation(['balancesheet', 'common'])
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => balanceSheetApi.delete(pumpId, report.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['balance-sheets', pumpId] })
      addToast(t('delete.deleted'), 'success')
      onClose()
    },
    onError: (err) => {
      const msg = parseApiError(err, t('delete.failed'))
      setError(msg)
      addToast(msg, 'error')
    },
  })

  return (
    <Modal
      title={t('delete.title')}
      subtitle={`${serverText(report.periodLabelCode, report.periodLabelParams, report.periodLabel)} · ${fmtDate(report.reportDate)}`}
      tone="danger"
      size="sm"
      onClose={onClose}
      canClose={!mutation.isPending}
      footer={<>
        <button type="button" onClick={onClose} disabled={mutation.isPending} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
        <LoadingButton type="button" onClick={() => { setError(null); mutation.mutate() }} isLoading={mutation.isPending}
          loadingLabel={t('delete.deleting')} className="ui-btn-danger">
          {t('delete.confirm')}
        </LoadingButton>
      </>}
      bodyClassName="space-y-3"
    >
          <p className="text-sm text-ink-2">
            <Trans
              t={t}
              i18nKey="delete.body"
              values={{ period: serverText(report.periodLabelCode, report.periodLabelParams, report.periodLabel), date: fmtDate(report.reportDate) }}
              components={{ period: <span className="font-medium" />, date: <span className="font-medium" /> }}
            />
          </p>
          {error && <p role="alert" className="ui-alert ui-alert-danger">{error}</p>}
    </Modal>
  )
}
