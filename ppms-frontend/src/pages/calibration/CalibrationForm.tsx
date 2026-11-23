import { useState } from 'react'
import { codeLabel } from '../../constants/labels'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { calibrationApi } from '../../api/calibrationApi'
import type { LogCalibrationRequest } from '../../api/calibrationApi'
import type { NozzleDetail } from '../../types/shift'
import { SearchableSelect } from '../../components/SearchableSelect'
import { addDays, localDateInputValue } from '../../utils/date'
import { PageSection } from '../../components/layout/PageSection'
import { FormGrid } from '../../components/layout/FormGrid'
import { FormField } from '../../components/FormField'
import { LoadingButton } from '../../components/LoadingButton'
import { useToastStore } from '../../store/toastStore'
import { Modal } from '../../components/Modal'
import { parseApiError } from '../../utils/apiError'
import { CalibrationReviewRow } from './CalibrationReviewRow'
import { fmtDate } from './calibrationFormat'

interface CalibrationFormProps {
  pumpId: number | null
  nozzles: NozzleDetail[]
  onRecorded: (nozzleId: number) => void
}

type Field = 'nozzle' | 'calibratedBy' | 'calibrationDate' | 'nextDue' | 'certificate'

interface FieldError {
  field: Field
  message: string
}

function missingDetailError(form: LogCalibrationRequest, t: TFunction<['calibration', 'common']>): FieldError | null {
  if (!form.calibratedBy?.trim()) return { field: 'calibratedBy', message: t('validation.calibratedByRequired') }
  if (!form.calibrationDate) return { field: 'calibrationDate', message: t('validation.dateRequired') }
  if (!form.nextCalibrationDue) return { field: 'nextDue', message: t('validation.nextDueRequired') }
  if (form.nextCalibrationDue <= form.calibrationDate) return { field: 'nextDue', message: t('validation.nextDueAfterDate') }
  if (!form.certificateReference?.trim()) return { field: 'certificate', message: t('validation.certificateRequired') }
  return null
}

export function CalibrationForm({ pumpId, nozzles, onRecorded }: CalibrationFormProps) {
  const { t } = useTranslation(['calibration', 'common'])
  const qc           = useQueryClient()
  const { addToast } = useToastStore()
  const [selectedNozzleId, setSelectedNozzleId] = useState<number>(0)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [form, setForm] = useState<LogCalibrationRequest>({
    calibrationDate: localDateInputValue(),
    nextCalibrationDue: null,
    calibratedBy: null,
    certificateReference: null,
    notes: null,
  })
  const [fieldError, setFieldError] = useState<FieldError | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (data: LogCalibrationRequest) =>
      calibrationApi.recordCalibration(pumpId!, selectedNozzleId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calibrations', pumpId] })
      onRecorded(selectedNozzleId)
      setForm({ calibrationDate: localDateInputValue(), nextCalibrationDue: null, calibratedBy: null, certificateReference: null, notes: null })
      setFieldError(null)
      setServerError(null)
      setReviewOpen(false)
      addToast(t('toast.recorded'), 'success')
    },
    onError: (err) => {
      const msg = parseApiError(err, t('toast.recordFailed'))
      setServerError(msg)
      addToast(msg, 'error')
    },
  })

  const validationError = (): FieldError | null =>
    selectedNozzleId ? missingDetailError(form, t) : { field: 'nozzle', message: t('validation.selectNozzle') }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    const error = validationError()
    setFieldError(error)
    if (!error) setReviewOpen(true)
  }

  const selectedNozzle = nozzles.find((n) => n.id === selectedNozzleId)
  const nozzleLabel = selectedNozzle
    ? t('nozzleOption', { number: selectedNozzle.nozzleNumber, fuel: codeLabel(selectedNozzle.fuelType) })
    : '—'

  const submitCalibration = () => {
    const error = validationError()
    if (error) {
      setFieldError(error)
      setReviewOpen(false)
      return
    }
    setServerError(null)
    createMutation.mutate({
      ...form,
      calibratedBy: form.calibratedBy?.trim() ?? null,
      certificateReference: form.certificateReference?.trim() ?? null,
      notes: form.notes?.trim() || null,
    })
  }

  const errorFor = (field: Field) => fieldError?.field === field ? fieldError.message : undefined
  const optional = <span className="text-ink-3">{t('common:fields.optionalSuffix')}</span>

  return (
    <>
      <PageSection title={t('form.title')} description={t('form.subtitle')}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormGrid>
            <div>
              <span className="ui-label">{t('form.nozzle')}</span>
              <SearchableSelect label={t('form.nozzle')}
                value={selectedNozzleId ? selectedNozzleId.toString() : ''}
                onChange={v => { setSelectedNozzleId(parseInt(v) || 0); setFieldError(null) }}
                placeholder={t('form.nozzlePlaceholder')}
                options={nozzles.map((n) => ({
                  value: n.id.toString(),
                  label: t('nozzleOption', { number: n.nozzleNumber, fuel: codeLabel(n.fuelType) }),
                }))}
              />
              {errorFor('nozzle') && <p role="alert" className="ui-error-text">{errorFor('nozzle')}</p>}
            </div>

            <FormField label={t('form.calibratedBy')} help={t('form.calibratedByHelp')} error={errorFor('calibratedBy')}>
              <input
                type="text"
                value={form.calibratedBy ?? ''}
                onChange={e => setForm(f => ({ ...f, calibratedBy: e.target.value || null }))}
              />
            </FormField>

            <FormField label={t('form.calibrationDate')} error={errorFor('calibrationDate')}>
              <input
                type="date"
                value={form.calibrationDate}
                onChange={e => setForm(f => ({ ...f, calibrationDate: e.target.value }))}
                required
              />
            </FormField>

            <FormField label={t('form.nextDue')} error={errorFor('nextDue')}>
              <input
                type="date"
                value={form.nextCalibrationDue ?? ''}
                min={form.calibrationDate ? addDays(form.calibrationDate, 1) : undefined}
                onChange={e => setForm(f => ({ ...f, nextCalibrationDue: e.target.value || null }))}
              />
            </FormField>

            <FormField label={t('form.certificate')} error={errorFor('certificate')}>
              <input
                type="text"
                value={form.certificateReference ?? ''}
                onChange={e => setForm(f => ({ ...f, certificateReference: e.target.value || null }))}
              />
            </FormField>

            <FormField label={<>{t('common:fields.notes')} {optional}</>}>
              <input
                type="text"
                value={form.notes ?? ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))}
              />
            </FormField>
          </FormGrid>

          {serverError && !reviewOpen && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}

          <div className="flex justify-end">
            <button type="submit" className="ui-btn ui-btn-primary">{t('form.review')}</button>
          </div>
        </form>
      </PageSection>

      {reviewOpen && (
        <Modal
          title={t('review.title')}
          subtitle={nozzleLabel}
          tone="info"
          onClose={() => setReviewOpen(false)}
          canClose={!createMutation.isPending}
          closeOnBackdropClick
          bodyClassName="space-y-4"
          footer={<>
            <button type="button" onClick={() => setReviewOpen(false)} disabled={createMutation.isPending} className="ui-btn ui-btn-secondary">
              {t('common:actions.edit')}
            </button>
            <LoadingButton type="button" onClick={submitCalibration} isLoading={createMutation.isPending}
              loadingLabel={t('common:actions.saving')} className="ui-btn-primary">
              {t('review.confirm')}
            </LoadingButton>
          </>}
        >
          {serverError && <p role="alert" className="ui-alert ui-alert-danger">{t('common:notices.goBackRetry', { error: serverError })}</p>}
          <div className="ui-card-plain ui-card-muted divide-y divide-border overflow-hidden text-sm">
            <CalibrationReviewRow label={t('review.nozzle')} value={nozzleLabel} />
            <CalibrationReviewRow label={t('review.calibrationDate')} value={fmtDate(form.calibrationDate)} />
            <CalibrationReviewRow label={t('review.nextDue')} value={form.nextCalibrationDue ? fmtDate(form.nextCalibrationDue) : '—'} />
            <CalibrationReviewRow label={t('review.calibratedBy')} value={form.calibratedBy?.trim() || '—'} />
            <CalibrationReviewRow label={t('review.certificate')} value={form.certificateReference?.trim() || '—'} />
            <CalibrationReviewRow label={t('common:fields.notes')} value={form.notes?.trim() || '—'} />
          </div>
        </Modal>
      )}
    </>
  )
}
