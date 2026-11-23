import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { creditApi } from '../../../api/creditApi'
import type { GenerateAllInvoicesResult } from '../../../api/creditApi'
import { Spinner } from '../../../components/Spinner'
import { Modal } from '../../../components/Modal'
import { FormGrid } from '../../../components/layout/FormGrid'
import { LoadingButton } from '../../../components/LoadingButton'
import { parseApiError } from '../../../utils/apiError'
import { formatCurrency } from '../../../utils/format'
import { lastCompletedMonth } from '../creditDates'

interface GenerateAllInvoicesModalProps {
  pumpId: number
  onClose: () => void
}

export function GenerateAllInvoicesModal({ pumpId, onClose }: GenerateAllInvoicesModalProps) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()
  const [periodFrom, setPeriodFrom] = useState(() => lastCompletedMonth().periodFrom)
  const [periodTo, setPeriodTo] = useState(() => lastCompletedMonth().periodTo)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateAllInvoicesResult | null>(null)
  const periodValid = periodFrom !== '' && periodTo !== '' && periodFrom <= periodTo

  const preview = useQuery({
    queryKey: ['credit-invoices', pumpId, 'preview', periodFrom, periodTo],
    queryFn: () => creditApi.previewInvoicesForAllClients(pumpId, { periodFrom, periodTo }),
    enabled: periodValid && result === null,
  })
  const gstMissing = preview.data?.gstDetailsComplete === false
  const nothingToInvoice = preview.data?.clientsToInvoice === 0
  const cannotGenerate = !preview.data || gstMissing || nothingToInvoice
  const gstMissingId = useId()
  const previewId = useId()

  const mutation = useMutation({
    mutationFn: () => creditApi.generateInvoicesForAllClients(pumpId, { periodFrom, periodTo }),
    onSuccess: (runResult) => {
      qc.invalidateQueries({ queryKey: ['credit-invoices', pumpId] })
      setResult(runResult)
    },
    onError: (err) => setError(parseApiError(err, t('generateInvoices.failed'))),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!periodValid) { setError(t('generateInvoices.invalidPeriod')); return }
    setError(null)
    mutation.mutate()
  }

  return (
    <Modal
      title={t('generateInvoices.title')}
      subtitle={t('generateInvoices.subtitle')}
      tone="info"
      size="md-wide"
      onClose={onClose}
      canClose={!mutation.isPending}
      onSubmit={result ? undefined : handleSubmit}
      bodyClassName="space-y-4"
      footer={
        <>
          {result ? (
            <button type="button" onClick={onClose} className="ui-btn ui-btn-primary">{t('common:actions.done')}</button>
          ) : (
            <>
              <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">{t('common:actions.cancel')}</button>
              <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('common:actions.generating')}
                disabled={cannotGenerate}
                aria-describedby={cannotGenerate ? (gstMissing ? gstMissingId : previewId) : undefined}
                className="ui-btn-primary">
                {preview.data && !nothingToInvoice
                  ? t('generateInvoices.generateCount', { count: preview.data.clientsToInvoice })
                  : t('common:actions.generate')}
              </LoadingButton>
            </>
          )}
        </>
      }
    >
      {result ? (
        <div role="status" className="ui-alert ui-alert-success text-sm space-y-1">
          <p><Trans t={t} i18nKey="generateInvoices.result.issued" count={result.invoicesIssued} components={{ strong: <strong /> }} /></p>
          <p>{t('generateInvoices.result.skipped', { count: result.clientsSkipped })}</p>
          {result.clientsFailed > 0 && (
            <p className="text-bad">{t('generateInvoices.result.failed', { count: result.clientsFailed })}</p>
          )}
        </div>
      ) : (
        <>
          {gstMissing && (
            <div id={gstMissingId} role="alert" className="ui-alert ui-alert-danger">
              <p className="font-semibold">{t('generateInvoices.gstMissing.title')}</p>
              <p>
                {t('generateInvoices.gstMissing.body')}{' '}
                <Link to="/dashboard/setup" onClick={onClose} className="ui-link">{t('generateInvoices.gstMissing.link')}</Link>
              </p>
            </div>
          )}
          <p className="text-sm text-ink-2">
            {t('generateInvoices.skipNote')}
          </p>
          <FormGrid>
            <label className="block">
              <span className="ui-label">{t('common:fields.from')}</span>
              <input type="date" value={periodFrom} max={periodTo || undefined}
                onChange={e => setPeriodFrom(e.target.value)} data-autofocus />
            </label>
            <label className="block">
              <span className="ui-label">{t('common:fields.to')}</span>
              <input type="date" value={periodTo} min={periodFrom || undefined}
                onChange={e => setPeriodTo(e.target.value)} />
            </label>
          </FormGrid>
          <div id={previewId} role="status" aria-live="polite" className="ui-card-plain ui-card-muted px-4 py-3 text-sm">
            {!periodValid ? (
              <span className="text-ink-3">{t('generateInvoices.preview.choosePeriod')}</span>
            ) : preview.isLoading ? (
              <span className="flex items-center gap-1.5 text-ink-3"><Spinner />{t('generateInvoices.preview.loading')}</span>
            ) : preview.isError ? (
              <span className="text-bad">{parseApiError(preview.error, t('generateInvoices.preview.failed'))}</span>
            ) : preview.data && (
              <span className="text-ink">
                {nothingToInvoice
                  ? t('generateInvoices.preview.nothing')
                  : <Trans t={t} i18nKey="generateInvoices.preview.summary" count={preview.data.clientsToInvoice}
                      values={{ amount: formatCurrency(preview.data.totalAmount) }} components={{ strong: <strong /> }} />}
              </span>
            )}
          </div>
          {error && <p role="alert" className="ui-alert ui-alert-danger">{error}</p>}
        </>
      )}
    </Modal>
  )
}
