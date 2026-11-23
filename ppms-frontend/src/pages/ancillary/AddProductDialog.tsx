import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { CreateProductRequest, UnitOfMeasure } from '../../api/ancillaryApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { useToastStore } from '../../store/toastStore'
import { Modal } from '../../components/Modal'
import { NumericInput } from '../../components/NumericInput'
import { FormField } from '../../components/FormField'
import { FormGrid } from '../../components/layout/FormGrid'
import { LoadingButton } from '../../components/LoadingButton'
import { StillNeeded } from '../../components/StillNeeded'
import { parseApiError } from '../../utils/apiError'
import { ReviewList, ReviewRow } from './ReviewRow'
import { UNITS } from './ancillaryFormat'
import { isValidHsnCode } from '../../utils/gst'

interface FieldErrors {
  name?: string
  packageSize?: string
  hsnCode?: string
}

/** Adds a counter product: name, pack and stock alert, then a review step before creating it. */
export function AddProductDialog({
  pumpId, onClose, onSuccess,
}: {
  pumpId: number
  onClose: () => void
  onSuccess: () => void
}) {
  const { t } = useTranslation(['ancillary', 'common'])
  const { addToast } = useToastStore()
  const stillNeededId = useId()
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [form, setForm] = useState<CreateProductRequest>({
    name: '', brand: '', variant: '', hsnCode: '',
    packageSize: 1, unitOfMeasure: 'PIECE',
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (data: CreateProductRequest) => ancillaryApi.createProduct(pumpId, data),
    onSuccess: () => {
      addToast(t('addProduct.created'), 'success')
      onSuccess()
    },
    onError: (err) => {
      const msg = parseApiError(err, t('addProduct.createFailed'))
      setServerError(msg)
      addToast(msg, 'error')
    },
  })

  const normalizedName = form.name.trim()
  const normalizedBrand = form.brand?.trim() || undefined
  const normalizedVariant = form.variant?.trim() || undefined
  const normalizedThreshold = form.lowStockThreshold && form.lowStockThreshold > 0 ? form.lowStockThreshold : undefined
  const normalizedHsnCode = form.hsnCode?.trim() || undefined

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}
    if (!normalizedName) errors.name = t('addProduct.nameMissing')
    if (!form.packageSize || form.packageSize <= 0) errors.packageSize = t('addProduct.packageSizePositive')
    if (!isValidHsnCode(form.hsnCode ?? '')) errors.hsnCode = t('validation.hsnInvalid')
    return errors
  }

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault()
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setServerError(null)
    setStep('review')
  }

  const handleCreate = () => {
    if (Object.keys(validate()).length > 0) {
      setStep('form')
      return
    }
    createMutation.mutate({
      name: normalizedName,
      brand: normalizedBrand,
      variant: normalizedVariant,
      packageSize: form.packageSize,
      unitOfMeasure: form.unitOfMeasure,
      lowStockThreshold: normalizedThreshold,
      hsnCode: normalizedHsnCode,
    })
  }

  const optional = (label: string) => (
    <>{label} <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span></>
  )

  const stillNeeded = [
    ...(normalizedName ? [] : [t('addProduct.needName')]),
    ...(form.packageSize > 0 ? [] : [t('addProduct.needPackageSize')]),
  ]

  return (
    <Modal
      tone="info"
      title={step === 'form' ? t('addProduct.title') : t('addProduct.reviewTitle')}
      subtitle={step === 'form' ? t('addProduct.subtitle') : normalizedName}
      size="lg"
      onClose={onClose}
      canClose={!createMutation.isPending}
      closeOnBackdropClick
      onSubmit={step === 'form' ? handleReview : undefined}
      bodyClassName="space-y-4"
      footer={step === 'form' ? (
        <>
          <StillNeeded id={stillNeededId} items={stillNeeded} />
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <button type="submit" disabled={stillNeeded.length > 0}
            aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
            className="ui-btn ui-btn-primary">
            {t('common:actions.review')}
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => { setStep('form'); setServerError(null) }}
            disabled={createMutation.isPending} className="ui-btn ui-btn-secondary">
            {t('common:actions.edit')}
          </button>
          <LoadingButton type="button" isLoading={createMutation.isPending} loadingLabel={t('addProduct.creating')}
            onClick={handleCreate} className="ui-btn-primary">
            {t('addProduct.create')}
          </LoadingButton>
        </>
      )}
    >
        {step === 'form' && (
          <>
            <FormGrid>
              <FormField label={t('addProduct.name')} error={fieldErrors.name}>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  data-autofocus
                />
              </FormField>
              <FormField label={optional(t('addProduct.brand'))}>
                <input
                  value={form.brand ?? ''}
                  onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                />
              </FormField>
              <FormField label={optional(t('addProduct.variant'))}>
                <input
                  value={form.variant ?? ''}
                  onChange={e => setForm(f => ({ ...f, variant: e.target.value }))}
                />
              </FormField>
              <FormField label={optional(t('fields.hsnCode'))} error={fieldErrors.hsnCode} help={fieldErrors.hsnCode ? undefined : t('editHsn.hint')}>
                <input
                  inputMode="numeric"
                  maxLength={8}
                  value={form.hsnCode ?? ''}
                  onChange={e => setForm(f => ({ ...f, hsnCode: e.target.value.replace(/\D/g, '') }))}
                />
              </FormField>
              <FormField label={t('addProduct.packageSize')} error={fieldErrors.packageSize}>
                <NumericInput
                  min="0.01"
                  step="0.01"
                  value={form.packageSize || ''}
                  onChange={e => setForm(f => ({ ...f, packageSize: parseFloat(e.target.value) || 0 }))}
                />
              </FormField>
              <div>
                <span className="ui-label">{t('addProduct.unit')}</span>
                <SearchableSelect label={t('addProduct.unit')}
                  value={form.unitOfMeasure}
                  onChange={v => setForm(f => ({ ...f, unitOfMeasure: v as UnitOfMeasure }))}
                  options={UNITS.map(u => ({ value: u, label: t(`units.${u}`) }))}
                />
              </div>
              <FormField label={optional(t('addProduct.lowStock'))} help={t('addProduct.lowStockHelp')}>
                <NumericInput
                  unit={t('fields.unitsSuffix')}
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={form.lowStockThreshold ?? ''}
                  onChange={e => setForm(f => ({ ...f, lowStockThreshold: e.target.value ? parseInt(e.target.value) : undefined }))}
                />
              </FormField>
            </FormGrid>
            {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
          </>
        )}

        {step === 'review' && (
          <>
            <ReviewList>
              <ReviewRow label={t('addProduct.name')} value={normalizedName} />
              <ReviewRow label={t('addProduct.brand')} value={normalizedBrand ?? '—'} />
              <ReviewRow label={t('addProduct.variant')} value={normalizedVariant ?? '—'} />
              <ReviewRow label={t('addProduct.packageSize')} value={`${form.packageSize} ${t(`units.${form.unitOfMeasure}`)}`} />
              <ReviewRow label={t('fields.hsnCode')} value={normalizedHsnCode ?? '—'} />
              <ReviewRow label={t('addProduct.lowStock')} value={normalizedThreshold != null ? t('addProduct.lowStockValue', { value: normalizedThreshold }) : t('addProduct.lowStockDisabled')} />
            </ReviewList>
            {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
          </>
        )}
    </Modal>
  )
}
