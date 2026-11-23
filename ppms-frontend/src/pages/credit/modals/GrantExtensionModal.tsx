import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { creditApi } from '../../../api/creditApi'
import type { CreditClient, CreateExtensionRequest, CreditExtensionType } from '../../../api/creditApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { formatIstDate, localDateInputValue } from '../../../utils/date'
import { Modal } from '../../../components/Modal'
import { FormField } from '../../../components/FormField'
import { FormGrid, FormGridFullRow } from '../../../components/layout/FormGrid'
import { NumericInput } from '../../../components/NumericInput'
import { LoadingButton } from '../../../components/LoadingButton'
import { LiveFigures } from '../../../components/LiveFigures'
import { StillNeeded } from '../../../components/StillNeeded'
import { MoneyText } from '../../../components/AmountText'
import { parseApiError } from '../../../utils/apiError'

interface GrantExtensionModalProps {
  client: CreditClient
  pumpId: number
  onClose: () => void
}

/** Each label is credit.json grantExtension.types.<type>, each description grantExtension.typeHelp.<type>. */
const EXTENSION_TYPES = ['AMOUNT_EXTENSION', 'BILLING_CYCLE_EXTENSION', 'OVERDUE_BLOCK_WAIVER'] as const

export function GrantExtensionModal({ client, pumpId, onClose }: GrantExtensionModalProps) {
  const { t } = useTranslation(['credit', 'common'])
  const [extensionType, setExtensionType] = useState<CreditExtensionType>('BILLING_CYCLE_EXTENSION')
  const qc = useQueryClient()
  const [extensionAmount, setExtensionAmount] = useState('')
  const [expiryDate, setExpiryDate] = useState(() => localDateInputValue())
  const [reason, setReason] = useState('')
  const [amountError, setAmountError] = useState<string | undefined>()
  const [serverError, setServerError] = useState<string | null>(null)
  const typeLabelId = useId()
  const stillNeededId = useId()

  const minDate = localDateInputValue(1)
  const isAmountExtension = extensionType === 'AMOUNT_EXTENSION'

  const stillNeeded = [
    ...(isAmountExtension && extensionAmount === '' ? [t('grantExtension.amountLabel')] : []),
    ...(expiryDate === '' ? [t('grantExtension.expiresOn')] : []),
    ...(reason.trim() === '' ? [t('grantExtension.reasonLabel')] : []),
  ]

  const mutation = useMutation({
    mutationFn: (req: CreateExtensionRequest) =>
      creditApi.createExtension(pumpId, client.id, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-extensions', pumpId, client.id] })
      onClose()
    },
    onError: (err) => setServerError(parseApiError(err, t('grantExtension.failed'))),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!expiryDate) { setServerError(t('grantExtension.expiryRequired')); return }
    if (!reason.trim()) { setServerError(t('grantExtension.reasonRequired')); return }
    if (isAmountExtension) {
      const amt = parseFloat(extensionAmount)
      if (!extensionAmount || isNaN(amt) || amt <= 0) { setAmountError(t('grantExtension.amountRequired')); return }
    }
    setAmountError(undefined)
    mutation.mutate({
      extensionType,
      extensionAmount: isAmountExtension ? parseFloat(extensionAmount) : undefined,
      expiryDate,
      reason: reason.trim(),
    })
  }

  const enteredAmount = extensionAmount === '' ? null : parseFloat(extensionAmount)
  const extraAmount = enteredAmount !== null && !isNaN(enteredAmount) && enteredAmount > 0 ? enteredAmount : null
  const hasLimit = client.creditLimit > 0
  const noLimit = <span className="text-ink-2">{t('grantExtension.unlimited')}</span>
  const expiryText = expiryDate ? formatIstDate(expiryDate) : '—'

  const expiryField = (
    <FormField label={t('grantExtension.expiresOn')}>
      <input type="date" min={minDate} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
    </FormField>
  )

  return (
    <Modal
      title={t('grantExtension.title')}
      subtitle={client.name}
      tone="info"
      size="md-wide"
      onClose={onClose}
      canClose={!mutation.isPending}
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={
        <>
          <StillNeeded id={stillNeededId} items={stillNeeded} />
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('grantExtension.granting')}
            disabled={stillNeeded.length > 0}
            aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
            className="ui-btn-primary">
            {t('clientActions.grantExtension')}
          </LoadingButton>
        </>
      }
    >
      <FormGrid>
        <FormGridFullRow>
          <span id={typeLabelId} className="ui-label">{t('grantExtension.typeLabel')}</span>
          <SearchableSelect aria-labelledby={typeLabelId}
            value={extensionType}
            onChange={(v) => setExtensionType(v as CreditExtensionType)}
            options={EXTENSION_TYPES.map(type => ({ value: type, label: t(`grantExtension.types.${type}`) }))}
          />
          <p className="ui-help">{t(`grantExtension.typeHelp.${extensionType}`)}</p>
        </FormGridFullRow>

        {isAmountExtension ? (
          <>
            <FormField label={t('grantExtension.amountLabel')} error={amountError}>
              <NumericInput unit="₹" min="1" step="0.01" value={extensionAmount}
                onChange={(e) => { setExtensionAmount(e.target.value); setAmountError(undefined) }} />
            </FormField>
            {expiryField}
          </>
        ) : (
          <FormGridFullRow>{expiryField}</FormGridFullRow>
        )}

        <FormGridFullRow>
          <FormField label={t('grantExtension.reasonLabel')}>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="resize-none" />
          </FormField>
        </FormGridFullRow>
      </FormGrid>

      {isAmountExtension && (
        <LiveFigures
          label={t('grantExtension.figuresLabel')}
          figures={[
            { label: t('grantExtension.currentLimit'), value: hasLimit ? <MoneyText value={client.creditLimit} /> : noLimit },
            { label: t('grantExtension.extraAmount'), value: <MoneyText value={extraAmount} /> },
            {
              label: t('grantExtension.limitUntil', { date: expiryText }),
              value: hasLimit ? <MoneyText value={extraAmount === null ? null : client.creditLimit + extraAmount} /> : noLimit,
              isResult: true,
            },
          ]}
        />
      )}

      {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
    </Modal>
  )
}
