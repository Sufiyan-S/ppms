import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../utils/apiError'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { useToastStore } from '../../store/toastStore'
import { FormField } from '../../components/FormField'
import { FormGrid } from '../../components/layout/FormGrid'
import { StickyActions } from '../../components/layout/StickyActions'
import { LoadingButton } from '../../components/LoadingButton'
import { isValidGstin, isValidInvoicePrefix, normaliseGstText } from '../../utils/gst'

// ── GST details used on credit invoices ──────────────────────────────────────

export function GstDetailsContent({ pump, onUpdated }: { pump: PumpSummary; onUpdated: () => void }) {
  const { t } = useTranslation(['setup', 'common'])
  const { addToast } = useToastStore()
  const [gstin, setGstin]                 = useState(pump.gstin ?? '')
  const [legalName, setLegalName]         = useState(pump.legalName ?? '')
  const [stateName, setStateName]         = useState(pump.stateName ?? '')
  const [invoicePrefix, setInvoicePrefix] = useState(pump.invoicePrefix ?? '')
  const [gstinError, setGstinError]       = useState<string | null>(null)
  const [prefixError, setPrefixError]     = useState<string | null>(null)
  const [error, setError]                 = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => pumpApi.updatePumpSettings(pump.id, {
      gstin: normaliseGstText(gstin),
      legalName: legalName.trim(),
      stateName: stateName.trim(),
      invoicePrefix: normaliseGstText(invoicePrefix),
    }),
    onSuccess: () => {
      addToast(t('gst.saved'), 'success')
      setError(null)
      onUpdated()
    },
    onError: (err) => setError(parseApiError(err, t('gst.saveFailed'))),
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const gstinValid = isValidGstin(gstin)
    const prefixValid = isValidInvoicePrefix(invoicePrefix)
    setGstinError(gstinValid ? null : t('common:gst.gstinFormat'))
    setPrefixError(prefixValid ? null : t('gst.prefixFormat'))
    if (!gstinValid || !prefixValid) return
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <p className="text-xs text-ink-3">
        {t('gst.introBefore')}
        {' '}<strong className="text-ink-2">{(normaliseGstText(invoicePrefix) || 'PMP3')}/26-27/0001</strong> {t('gst.introAfter')}
      </p>

      <FormGrid>
        <FormField label="GSTIN" error={gstinError ?? undefined}>
          <input value={gstin} onChange={(e) => { setGstin(e.target.value.toUpperCase()); setGstinError(null) }}
            maxLength={15} autoCapitalize="characters" placeholder={t('common:gst.gstinPlaceholder')} className="text-sm" />
        </FormField>
        <FormField label={t('gst.legalName')}>
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)}
            maxLength={150} placeholder={t('gst.legalNamePlaceholder')} className="text-sm" />
        </FormField>
        <FormField label={t('gst.state')}>
          <input value={stateName} onChange={(e) => setStateName(e.target.value)}
            maxLength={60} placeholder={t('gst.statePlaceholder')} className="text-sm" />
        </FormField>
        <FormField label={t('gst.invoicePrefix')} help={t('gst.invoicePrefixHelp')} error={prefixError ?? undefined}>
          <input value={invoicePrefix} onChange={(e) => { setInvoicePrefix(e.target.value.toUpperCase()); setPrefixError(null) }}
            maxLength={5} autoCapitalize="characters" placeholder={t('gst.invoicePrefixPlaceholder')} className="text-sm" />
        </FormField>
      </FormGrid>

      <StickyActions className="items-center bg-surface">
        {error && <p role="alert" className="ui-error-text mr-auto mt-0">{error}</p>}
        <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('common:actions.saving')} className="ui-btn-primary">
          {t('gst.save')}
        </LoadingButton>
      </StickyActions>
    </form>
  )
}
