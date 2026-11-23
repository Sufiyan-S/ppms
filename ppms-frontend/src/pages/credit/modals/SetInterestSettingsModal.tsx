import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { creditApi } from '../../../api/creditApi'
import type { CreditClient, UpdateInterestSettingsRequest } from '../../../api/creditApi'
import { Modal } from '../../../components/Modal'
import { FormField } from '../../../components/FormField'
import { FormGrid } from '../../../components/layout/FormGrid'
import { NumericInput } from '../../../components/NumericInput'
import { LoadingButton } from '../../../components/LoadingButton'
import { LiveFigures } from '../../../components/LiveFigures'
import { MoneyText } from '../../../components/AmountText'
import { parseApiError } from '../../../utils/apiError'

interface SetInterestSettingsModalProps {
  client: CreditClient
  pumpId: number
  onClose: () => void
}

/** The interest a 30-day month adds at this rate, the same simple-interest rule the server applies. */
function interestFor30Days(outstanding: number, ratePercent: number): number {
  return Math.round(outstanding * ratePercent) / 100
}

export function SetInterestSettingsModal({ client, pumpId, onClose }: SetInterestSettingsModalProps) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()
  const [rate, setRate] = useState(client.monthlyInterestRate > 0 ? String(client.monthlyInterestRate) : '')
  const [graceDays, setGraceDays] = useState(String(client.interestGraceDays ?? 1))
  const [rateError, setRateError] = useState<string | undefined>()
  const [graceError, setGraceError] = useState<string | undefined>()
  const [serverError, setServerError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (req: UpdateInterestSettingsRequest) =>
      creditApi.updateInterestSettings(pumpId, client.id, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-ledger', pumpId] })
      onClose()
    },
    onError: (err) => setServerError(parseApiError(err, t('interestSettings.failed'))),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    const r = rate.trim() === '' ? 0 : parseFloat(rate)
    const g = parseInt(graceDays, 10)
    if (isNaN(r) || r < 0 || r > 100) { setRateError(t('interestSettings.invalidRate')); return }
    setRateError(undefined)
    if (isNaN(g) || g < 0) { setGraceError(t('interestSettings.invalidGraceDays')); return }
    setGraceError(undefined)
    mutation.mutate({ monthlyInterestRate: r, interestGraceDays: g })
  }

  const enteredRate = rate.trim() === '' ? null : parseFloat(rate)
  const exampleInterest = enteredRate === null || isNaN(enteredRate) || enteredRate < 0 || enteredRate > 100
    ? null
    : interestFor30Days(client.outstandingBalance, enteredRate)

  return (
    <Modal
      title={t('interestSettings.title')}
      subtitle={client.name}
      tone="info"
      size="md-wide"
      onClose={onClose}
      canClose={!mutation.isPending}
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={
        <>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('common:actions.saving')}
            className="ui-btn-primary">
            {t('interestSettings.save')}
          </LoadingButton>
        </>
      }
    >
      <p className="text-sm text-ink-2">
        <Trans t={t} i18nKey="interestSettings.explanation" components={{ strong: <strong /> }} />
      </p>

      <FormGrid>
        <FormField label={t('interestSettings.rateLabel')} help={t('interestSettings.rateHelp')} error={rateError}>
          <NumericInput unit="%" min="0" max="100" step="0.01" value={rate}
            onChange={e => { setRate(e.target.value); setRateError(undefined) }}
            data-autofocus />
        </FormField>
        <FormField label={t('interestSettings.graceLabel')} help={t('interestSettings.graceHelp')} error={graceError}>
          <NumericInput unit={t('interestSettings.daysUnit')} min="0" step="1" inputMode="numeric" value={graceDays}
            onChange={e => { setGraceDays(e.target.value); setGraceError(undefined) }} />
        </FormField>
      </FormGrid>

      <LiveFigures
        label={t('interestSettings.figuresLabel')}
        figures={[
          { label: t('interestSettings.outstanding'), value: <MoneyText value={client.outstandingBalance} /> },
          { label: t('interestSettings.exampleInterest'), value: <MoneyText value={exampleInterest} />, isResult: true },
        ]}
      />

      {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
    </Modal>
  )
}
