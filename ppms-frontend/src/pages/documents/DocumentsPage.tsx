import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Clock, FileText, Plus } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { documentApi } from '../../api/documentApi'
import type { PumpDocument, UpsertDocumentRequest, DocumentStatus } from '../../api/documentApi'
import { SkeletonRows } from '../../components/Skeleton'
import { LoadingButton } from '../../components/LoadingButton'
import { FormField } from '../../components/FormField'
import { ConfirmButton } from '../../components/ConfirmButton'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { PageSection } from '../../components/layout/PageSection'
import { FilterBar } from '../../components/layout/FilterBar'
import { FormGrid } from '../../components/layout/FormGrid'
import { formatIstDate } from '../../utils/date'
import { parseApiError } from '../../utils/apiError'
import { useToastStore } from '../../store/toastStore'
import { codeLabel } from '../../constants/labels'
import { StatusBadge } from '../../components/StatusBadge'
import type { StatusBadgeSpec } from '../../components/statusBadges'

const STATUS_BADGES: Record<DocumentStatus, Omit<StatusBadgeSpec, 'label'>> = {
  VALID:          { tone: 'ok', icon: Check },
  EXPIRING_SOON:  { tone: 'warn', icon: Clock },
  EXPIRED:        { tone: 'bad', icon: AlertTriangle },
}

const DOCUMENT_STATUSES: DocumentStatus[] = ['EXPIRED', 'EXPIRING_SOON', 'VALID']

const EMPTY_FORM: UpsertDocumentRequest = { name: '', docType: '', expiryDate: null, notes: null }

interface FieldErrors {
  name?: string
  docType?: string
}

export default function DocumentsPage() {
  const { t } = useTranslation(['documents', 'common'])
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const { selectedPumpId: pumpId } = usePumpStore()
  const { addToast } = useToastStore()

  const { data: docs = [], isLoading } = useQuery({
    queryKey:  ['documents', pumpId],
    queryFn:   () => documentApi.getDocuments(pumpId!),
    enabled:   !!pumpId,
  })

  const [form, setForm] = useState<UpsertDocumentRequest>(EMPTY_FORM)
  const [editId, setEditId] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [showForm, setShowForm] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status')
  const statusFilter = DOCUMENT_STATUSES.find(status => status === statusParam) ?? null

  const saveMutation = useMutation({
    mutationFn: (data: UpsertDocumentRequest) =>
      editId
        ? documentApi.updateDocument(pumpId!, editId, data)
        : documentApi.createDocument(pumpId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', pumpId] })
      addToast(editId ? t('toast.updated') : t('toast.added'), 'success')
      setForm(EMPTY_FORM)
      setEditId(null)
      setShowForm(false)
      setFormError(null)
      setFieldErrors({})
    },
    onError: (err) => setFormError(parseApiError(err, t('toast.saveFailed'))),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => documentApi.deleteDocument(pumpId!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', pumpId] })
      addToast(t('toast.deleted'), 'success')
    },
    onError: (err) => {
      addToast(parseApiError(err, t('toast.deleteFailed')), 'error')
    },
  })

  const startEdit = (doc: PumpDocument) => {
    setForm({ name: doc.name, docType: doc.docType, expiryDate: doc.expiryDate, notes: doc.notes })
    setEditId(doc.id)
    setShowForm(true)
    setFormError(null)
    setFieldErrors({})
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const errors: FieldErrors = {
      name: form.name.trim() ? undefined : t('form.nameRequired'),
      docType: form.docType.trim() ? undefined : t('form.typeRequired'),
    }
    setFieldErrors(errors)
    if (errors.name || errors.docType) return
    saveMutation.mutate(form)
  }

  useEffect(() => {
    if (showForm) nameInputRef.current?.focus()
  }, [showForm, editId])

  const optional = <span className="text-ink-3">{t('common:fields.optionalSuffix')}</span>
  const expiredCount     = docs.filter(d => d.status === 'EXPIRED').length
  const expiringSoonCount = docs.filter(d => d.status === 'EXPIRING_SOON').length
  const isOwner = user?.role === 'OWNER'
  const shownDocs = statusFilter ? docs.filter(d => d.status === statusFilter) : docs

  const setStatusFilter = (status: DocumentStatus | null) => setSearchParams((params) => {
    const updated = new URLSearchParams(params)
    if (status) updated.set('status', status)
    else updated.delete('status')
    return updated
  }, { replace: true })

  const openAddForm = () => {
    setForm(EMPTY_FORM)
    setEditId(null)
    setShowForm(true)
    setFormError(null)
    setFieldErrors({})
  }

  const closeForm = () => {
    setForm(EMPTY_FORM)
    setEditId(null)
    setShowForm(false)
    setFormError(null)
    setFieldErrors({})
  }

  return (
    <Page>
      <PageHeader
        title={t('page.title')}
        description={t('page.subtitle')}
        badges={!isLoading && pumpId && (
          <StatusBadge tone="neutral" icon={FileText} label={t('page.documentCount', { count: docs.length })} />
        )}
        primaryAction={!showForm && (
          <button type="button" onClick={openAddForm} className="ui-btn ui-btn-primary inline-flex items-center gap-1.5">
            <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
            {t('page.addButton')}
          </button>
        )}
      />

      {(expiredCount > 0 || expiringSoonCount > 0) && (
        <div className="ui-alert ui-alert-danger">
          <p className="text-sm font-semibold text-bad">{t('alert.title')}</p>
          <p className="text-xs text-bad mt-0.5">
            {expiredCount > 0 && <>{t('alert.expired', { count: expiredCount })}{' '}</>}
            {expiringSoonCount > 0 && t('alert.expiringSoon', { count: expiringSoonCount })}
          </p>
        </div>
      )}

      {showForm && (
        <PageSection title={editId ? t('form.editTitle') : t('form.addTitle')} description={t('form.subtitle')}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormGrid>
              <FormField label={t('form.name')} error={fieldErrors.name}>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </FormField>

              <FormField label={t('form.type')} help={t('form.typeHelp')} error={fieldErrors.docType}>
                <input
                  type="text"
                  value={form.docType}
                  onChange={e => setForm(f => ({ ...f, docType: e.target.value }))}
                  required
                />
              </FormField>

              <FormField label={<>{t('form.expiryDate')} {optional}</>}>
                <input
                  type="date"
                  value={form.expiryDate ?? ''}
                  onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value || null }))}
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

            {formError && <p role="alert" className="ui-alert ui-alert-danger">{formError}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={closeForm} className="ui-btn ui-btn-secondary">
                {t('common:actions.cancel')}
              </button>
              <LoadingButton type="submit" isLoading={saveMutation.isPending} loadingLabel={t('common:actions.saving')}
                className="ui-btn-primary">
                {editId ? t('form.update') : t('form.add')}
              </LoadingButton>
            </div>
          </form>
        </PageSection>
      )}

      <PageSection title={t('list.title', { count: docs.length })} flush>
        <FilterBar
          label={t('list.filtersLabel')}
          onClearFilters={() => setStatusFilter(null)}
          hasActiveFilters={statusFilter !== null}
          summary={statusFilter ? t('list.shownOf', { count: shownDocs.length, total: docs.length }) : undefined}
        >
          {DOCUMENT_STATUSES.map(status => (
            <button
              key={status}
              type="button"
              aria-pressed={statusFilter === status}
              onClick={() => setStatusFilter(statusFilter === status ? null : status)}
              className="ui-chip"
            >
              {codeLabel(status)}
            </button>
          ))}
        </FilterBar>

        {isLoading ? (
          <div className="px-5 py-4"><SkeletonRows count={4} /></div>
        ) : docs.length === 0 ? (
          <p className="ui-empty px-5 py-6">{t('list.empty')}</p>
        ) : shownDocs.length === 0 ? (
          <p className="ui-empty px-5 py-6">{t('list.noneWithStatus')}</p>
        ) : (
          <div className="ui-record-list">
            {shownDocs.map(doc => (
              <div key={doc.id} className="ui-record-row">
                <div className="ui-record-row__main">
                  <div className="ui-record-row__title">
                    <p className="text-sm font-medium text-ink">{doc.name}</p>
                    <StatusBadge {...STATUS_BADGES[doc.status]} label={codeLabel(doc.status)} />
                  </div>
                  <div className="ui-record-row__meta">
                    <p className="text-xs text-ink-3">{doc.docType}</p>
                    <span className="text-xs text-ink-3">·</span>
                    <p className="text-xs text-ink-3">{t('list.expires', { date: doc.expiryDate ? formatIstDate(doc.expiryDate) : t('list.noExpiry') })}</p>
                    {doc.notes && <><span className="text-xs text-ink-3">·</span><p className="text-xs text-ink-3 truncate">{doc.notes}</p></>}
                  </div>
                </div>
                <div className="ui-record-row__actions">
                  <button
                    onClick={() => startEdit(doc)}
                    className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-primary hover:text-primary-strong"
                  >
                    {t('common:actions.edit')}
                  </button>
                  {isOwner && (
                    <ConfirmButton
                      onConfirm={() => deleteMutation.mutate(doc.id)}
                      disabled={deleteMutation.isPending}
                      triggerAriaLabel={t('list.deleteNamed', { name: doc.name })}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>
    </Page>
  )
}
