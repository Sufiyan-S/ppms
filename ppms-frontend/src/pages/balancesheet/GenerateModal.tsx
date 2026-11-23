import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { balanceSheetApi } from '../../api/balanceSheetApi'
import { parseApiError } from '../../utils/apiError'
import type { GenerateBalanceSheetRequest } from '../../api/balanceSheetApi'
import { shiftDefinitionApi } from '../../api/shiftDefinitionApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { localDateInputValue } from '../../utils/date'
import { useToastStore } from '../../store/toastStore'
import { Modal } from '../../components/Modal'
import { LoadingButton } from '../../components/LoadingButton'
import { StillNeeded } from '../../components/StillNeeded'
import { LiveFigures } from '../../components/LiveFigures'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'
import { fmtDate } from './bsFormat'

interface GenerateModalProps {
  pumpId: number
  onClose: () => void
  /** Called with the new sheet's id instead of onClose once it is saved. */
  onGenerated: (sheetId: number) => void
}

export function GenerateModal({ pumpId, onClose, onGenerated }: GenerateModalProps) {
  const { t } = useTranslation(['balancesheet', 'common'])
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const stillNeededId = useId()

  const [reportType, setReportType] = useState<'SHIFT' | 'DAY'>('SHIFT')
  const [reportDate, setReportDate] = useState(() => localDateInputValue(0))
  const [shiftDefinitionId, setShiftDefinitionId] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [existingBsMsg, setExistingBsMsg] = useState<string | null>(null)

  const { data: shiftDefinitions = [], isLoading: defsLoading } = useQuery({
    queryKey: ['shift-definitions-active', pumpId],
    queryFn: () => shiftDefinitionApi.getActive(pumpId),
    enabled: reportType === 'SHIFT',
  })

  const selectedShiftDefinitionId = reportType === 'SHIFT'
    ? (shiftDefinitionId ?? shiftDefinitions[0]?.id ?? null)
    : null
  const selectedShift = shiftDefinitions.find((d) => d.id === selectedShiftDefinitionId) ?? null

  const mutation = useMutation({
    mutationFn: (req: GenerateBalanceSheetRequest) => balanceSheetApi.generate(pumpId, req),
    onSuccess: (generated) => {
      qc.invalidateQueries({ queryKey: ['balance-sheets', pumpId] })
      addToast(t('generate.success'), 'success')
      onGenerated(generated.id)
    },
    onError: (err) => {
      const msg: string = parseApiError(err, t('generate.failed'))
      // Backend returns "already exists" — offer the user a re-generate option
      if (msg.includes('already exists')) {
        setConfirmRegenerate(true)
        setExistingBsMsg(msg)
        setError(null)
      } else {
        setError(msg)
        addToast(msg, 'error')
      }
    },
  })

  const stillNeeded = [
    ...(reportDate === '' ? [t('generate.stillNeeded.date')] : []),
    ...(reportType === 'SHIFT' && !defsLoading && selectedShiftDefinitionId === null ? [t('generate.stillNeeded.shift')] : []),
  ]
  const canGenerate = stillNeeded.length === 0 && !(reportType === 'SHIFT' && defsLoading)

  const buildReq = (force = false): GenerateBalanceSheetRequest => {
    const req: GenerateBalanceSheetRequest = {
      reportType,
      reportDate,
      notes: notes.trim() || undefined,
      forceRegenerate: force || undefined,
    }
    if (selectedShiftDefinitionId !== null) {
      req.shiftDefinitionId = selectedShiftDefinitionId
    }
    return req
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!canGenerate) return
    setError(null)
    setConfirmRegenerate(false)
    mutation.mutate(buildReq())
  }

  const handleForceRegenerate = () => {
    setConfirmRegenerate(false)
    mutation.mutate(buildReq(true))
  }

  const coverage = reportDate === ''
    ? null
    : reportType === 'DAY'
    ? t('generate.coverage.day', { date: fmtDate(reportDate) })
    : selectedShift
    ? t('generate.coverage.shift', { date: fmtDate(reportDate), shift: `${selectedShift.name} · ${selectedShift.windowLabel}` })
    : null

  return (
    <Modal
      title={t('generate.title')}
      subtitle={coverage ?? t('generate.subtitle')}
      tone="info"
      size="md-wide"
      onClose={onClose}
      canClose={!mutation.isPending}
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={<>
        <StillNeeded id={stillNeededId} items={stillNeeded} />
        <button type="button" onClick={onClose} disabled={mutation.isPending} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
        <LoadingButton type="submit" isLoading={mutation.isPending && !confirmRegenerate} loadingLabel={t('common:actions.generating')}
          disabled={!canGenerate} aria-describedby={stillNeeded.length ? stillNeededId : undefined}
          className="ui-btn-primary">
          {t('generate.submit')}
        </LoadingButton>
      </>}
    >
      <div>
        <span id={`${stillNeededId}-type`} className="ui-label">{t('generate.reportType')}</span>
        <div role="group" aria-labelledby={`${stillNeededId}-type`} className="ui-card-plain flex gap-1 p-1">
          {(['SHIFT', 'DAY'] as const).map(type => (
            <button
              key={type}
              type="button"
              aria-pressed={reportType === type}
              onClick={() => { setReportType(type); if (type === 'DAY') setShiftDefinitionId(null) }}
              className={`ui-btn min-h-0 flex-1 px-3 py-2 text-sm font-medium ${
                reportType === type
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface text-ink-2 hover:bg-bg'
              }`}
            >
              {type === 'SHIFT' ? t('generate.shiftReport') : t('generate.dayReport')}
            </button>
          ))}
        </div>
        <p className="ui-help">
          {reportType === 'SHIFT' ? t('generate.shiftHelp') : t('generate.dayHelp')}
        </p>
      </div>

      <FormGrid>
        <div className={reportType === 'DAY' ? 'ui-form-grid__full' : undefined}>
          <label htmlFor={`${stillNeededId}-date`} className="ui-label">{t('generate.businessDate')}</label>
          <input id={`${stillNeededId}-date`} type="date" value={reportDate} required
            onChange={e => setReportDate(e.target.value)} />
        </div>

        {reportType === 'SHIFT' && (
          <div>
            <span className="ui-label">{t('generate.shift')}</span>
            {defsLoading ? (
              <p className="ui-help">{t('generate.loadingShifts')}</p>
            ) : shiftDefinitions.length === 0 ? (
              <p role="alert" className="ui-error-text">{t('generate.noShiftDefinitions')}</p>
            ) : (
              <SearchableSelect label={t('generate.shift')}
                value={selectedShiftDefinitionId !== null ? String(selectedShiftDefinitionId) : ''}
                onChange={v => setShiftDefinitionId(Number(v))}
                options={shiftDefinitions.map(d => ({ value: String(d.id), label: `${d.name} · ${d.windowLabel}` }))}
              />
            )}
          </div>
        )}

        <FormGridFullRow>
          <label htmlFor={`${stillNeededId}-notes`} className="ui-label">
            {t('common:fields.notes')} <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span>
          </label>
          <textarea id={`${stillNeededId}-notes`} value={notes} rows={2} className="resize-none"
            onChange={e => setNotes(e.target.value)} />
        </FormGridFullRow>
      </FormGrid>

      <LiveFigures
        label={t('generate.coverage.label')}
        figures={[{ label: t('generate.coverage.label'), value: coverage ?? '—' }]}
      />

      {confirmRegenerate && (
        <div role="alert" className="ui-alert ui-alert-warning space-y-2">
          <p className="font-medium">{t('generate.alreadyExists')}</p>
          {existingBsMsg && <p className="text-xs">{existingBsMsg}</p>}
          <p className="text-xs">{t('generate.revisionHelp')}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <LoadingButton type="button" onClick={handleForceRegenerate} isLoading={mutation.isPending}
              loadingLabel={t('common:actions.generating')} className="ui-btn-primary ui-btn-compact">
              {t('generate.confirmRevision')}
            </LoadingButton>
            <button type="button" onClick={() => setConfirmRegenerate(false)} disabled={mutation.isPending}
              className="ui-btn ui-btn-secondary ui-btn-compact">
              {t('generate.keepExisting')}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="ui-alert ui-alert-danger">{error}</p>
      )}
    </Modal>
  )
}
