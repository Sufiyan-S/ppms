import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Building2, ReceiptText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../utils/apiError'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { useToastStore } from '../../store/toastStore'
import { FormField } from '../../components/FormField'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'
import { isValidGstin, isValidInvoicePrefix, normaliseGstText } from '../../utils/gst'
import { SetupFormGroup } from './SetupFormGroup'
import { SetupSaveBar } from './SetupSaveBar'

interface GstValues {
  gstin: string
  legalName: string
  stateName: string
  invoicePrefix: string
}

const sameValues = (a: GstValues, b: GstValues) =>
  normaliseGstText(a.gstin) === normaliseGstText(b.gstin) && a.legalName.trim() === b.legalName.trim()
  && a.stateName.trim() === b.stateName.trim() && normaliseGstText(a.invoicePrefix) === normaliseGstText(b.invoicePrefix)

/** The GST details printed on credit invoices. */
export function GstDetailsContent({ pump, onUpdated }: { pump: PumpSummary; onUpdated: () => void }) {
  const { t } = useTranslation(['setup', 'common'])
  const { addToast } = useToastStore()
  const [saved, setSaved] = useState<GstValues>({
    gstin: pump.gstin ?? '', legalName: pump.legalName ?? '', stateName: pump.stateName ?? '', invoicePrefix: pump.invoicePrefix ?? '',
  })
  const [values, setValues]           = useState<GstValues>(saved)
  const [gstinError, setGstinError]   = useState<string | null>(null)
  const [prefixError, setPrefixError] = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const set = (patch: Partial<GstValues>) => { setValues((prev) => ({ ...prev, ...patch })); setError(null) }

  const mutation = useMutation({
    mutationFn: () => pumpApi.updatePumpSettings(pump.id, {
      gstin: normaliseGstText(values.gstin),
      legalName: values.legalName.trim(),
      stateName: values.stateName.trim(),
      invoicePrefix: normaliseGstText(values.invoicePrefix),
    }),
    onSuccess: () => {
      addToast(t('gst.saved'), 'success')
      setError(null)
      setSaved(values)
      onUpdated()
    },
    onError: (err) => setError(parseApiError(err, t('gst.saveFailed'))),
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const gstinValid = isValidGstin(values.gstin)
    const prefixValid = isValidInvoicePrefix(values.invoicePrefix)
    setGstinError(gstinValid ? null : t('common:gst.gstinFormat'))
    setPrefixError(prefixValid ? null : t('gst.prefixFormat'))
    if (!gstinValid || !prefixValid) return
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <SetupFormGroup icon={Building2} title={t('gst.businessTitle')} hint={t('gst.businessHint')}>
        <FormGrid>
          <FormField label="GSTIN" help={t('gst.gstinHelp')} error={gstinError ?? undefined}>
            <input value={values.gstin} onChange={(e) => { set({ gstin: e.target.value.toUpperCase() }); setGstinError(null) }}
              maxLength={15} autoCapitalize="characters" placeholder={t('common:gst.gstinPlaceholder')} className="text-sm tabular-nums" />
          </FormField>
          <FormField label={t('gst.state')}>
            <input value={values.stateName} onChange={(e) => set({ stateName: e.target.value })}
              maxLength={60} placeholder={t('gst.statePlaceholder')} className="text-sm" />
          </FormField>
          <FormGridFullRow>
            <FormField label={t('gst.legalName')}>
              <input value={values.legalName} onChange={(e) => set({ legalName: e.target.value })}
                maxLength={150} placeholder={t('gst.legalNamePlaceholder')} className="text-sm" />
            </FormField>
          </FormGridFullRow>
        </FormGrid>
      </SetupFormGroup>

      <SetupFormGroup icon={ReceiptText} title={t('gst.numberingTitle')} hint={t('gst.numberingHint')}>
        <FormGrid>
          <FormField label={t('gst.invoicePrefix')} help={t('gst.invoicePrefixHelp')} error={prefixError ?? undefined}>
            <input value={values.invoicePrefix} onChange={(e) => { set({ invoicePrefix: e.target.value.toUpperCase() }); setPrefixError(null) }}
              maxLength={5} autoCapitalize="characters" placeholder={t('gst.invoicePrefixPlaceholder')} className="text-sm" />
          </FormField>
          <div className="rounded-control border border-border bg-surface-sunken p-3">
            <p className="ui-kpi-label">{t('gst.firstInvoice')}</p>
            <p className="mt-1 text-base font-semibold text-ink tabular-nums">{(normaliseGstText(values.invoicePrefix) || 'PMP3')}/26-27/0001</p>
          </div>
        </FormGrid>
      </SetupFormGroup>

      <SetupSaveBar hasChanges={!sameValues(values, saved)} isSaving={mutation.isPending} saveLabel={t('gst.save')} error={error} />
    </form>
  )
}
