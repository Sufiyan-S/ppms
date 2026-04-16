import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { documentApi } from '../../api/documentApi'
import type { PumpDocument, UpsertDocumentRequest, DocumentStatus } from '../../api/documentApi'
import { SkeletonRows } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { formatIstDate } from '../../utils/date'

const STATUS_STYLES: Record<DocumentStatus, string> = {
  VALID:          'bg-emerald-100 text-emerald-700',
  EXPIRING_SOON:  'bg-amber-100 text-amber-700',
  EXPIRED:        'bg-red-100 text-red-700',
}

function fmtDate(d: string | null) {
  if (!d) return 'No expiry'
  return formatIstDate(d)
}

const EMPTY_FORM: UpsertDocumentRequest = { name: '', docType: '', expiryDate: null, notes: null }

export default function DocumentsPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const { selectedPumpId: pumpId } = usePumpStore()

  const { data: docs = [], isLoading } = useQuery({
    queryKey:  ['documents', pumpId],
    queryFn:   () => documentApi.getDocuments(pumpId!),
    enabled:   !!pumpId,
  })

  const [form, setForm] = useState<UpsertDocumentRequest>(EMPTY_FORM)
  const [editId, setEditId] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const saveMutation = useMutation({
    mutationFn: (data: UpsertDocumentRequest) =>
      editId
        ? documentApi.updateDocument(pumpId!, editId, data)
        : documentApi.createDocument(pumpId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', pumpId] })
      setForm(EMPTY_FORM)
      setEditId(null)
      setShowForm(false)
      setFormError(null)
    },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'Failed to save document'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => documentApi.deleteDocument(pumpId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', pumpId] }),
  })

  const startEdit = (doc: PumpDocument) => {
    setForm({ name: doc.name, docType: doc.docType, expiryDate: doc.expiryDate, notes: doc.notes })
    setEditId(doc.id)
    setShowForm(true)
    setFormError(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.docType.trim()) { setFormError('Name and document type are required'); return }
    saveMutation.mutate(form)
  }

  const expiredCount     = docs.filter(d => d.status === 'EXPIRED').length
  const expiringSoonCount = docs.filter(d => d.status === 'EXPIRING_SOON').length
  const isOwner = user?.role === 'OWNER'

  return (
    <div className="ui-page ui-page--narrow space-y-5">

      {/* ── Header ── */}
      <Reveal delay={60}>
      <div className="ui-page-header">
        <div>
          <h1 className="ui-title-sm">Compliance Documents</h1>
          <p className="ui-subtitle">Track licences, permits, and certificates</p>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setEditId(null); setShowForm(s => !s); setFormError(null) }}
          className="ui-btn ui-btn-primary"
        >
          {showForm ? 'Cancel' : '+ Add Document'}
        </button>
      </div>
      </Reveal>

      {/* ── Alert strip ── */}
      {(expiredCount > 0 || expiringSoonCount > 0) && (
        <Reveal delay={120}>
        <div className="ui-alert ui-alert-danger">
          <p className="text-sm font-semibold text-red-700">Compliance attention needed</p>
          <p className="text-xs text-red-500 mt-0.5">
            {expiredCount > 0 && `${expiredCount} document${expiredCount !== 1 ? 's' : ''} expired. `}
            {expiringSoonCount > 0 && `${expiringSoonCount} document${expiringSoonCount !== 1 ? 's' : ''} expiring within 30 days.`}
          </p>
        </div>
        </Reveal>
      )}

      {/* ── Add/edit form ── */}
      {showForm && (
        <form onSubmit={handleSubmit} className="ui-card ui-form-shell">
          <div className="ui-form-shell__head">
            <div>
              <p className="ui-section-kicker mb-2">Document Intake</p>
              <h2 className="ui-title-sm">{editId ? 'Edit document' : 'Add document'}</h2>
              <p className="ui-subtitle mt-1">Store expiry dates, document types, and notes in one place.</p>
            </div>
          </div>

          <div className="ui-form-shell__grid">
            <div>
              <label className="ui-label">Document Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="text-sm"
                placeholder="e.g. Petrol Pump Licence"
                required
              />
            </div>

            <div>
              <label className="ui-label">Document Type</label>
              <input
                type="text"
                value={form.docType}
                onChange={e => setForm(f => ({ ...f, docType: e.target.value }))}
                className="text-sm"
                placeholder="e.g. Licence, Certificate, Permit"
                required
              />
            </div>

            <div>
              <label className="ui-label">Expiry Date (optional)</label>
              <input
                type="date"
                value={form.expiryDate ?? ''}
                onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value || null }))}
                className="text-sm"
              />
            </div>

            <div>
              <label className="ui-label">Notes (optional)</label>
              <input
                type="text"
                value={form.notes ?? ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))}
                className="text-sm"
                placeholder="Any additional notes"
              />
            </div>
          </div>

          {formError && <p className="ui-error-text">{formError}</p>}

          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="ui-btn ui-btn-primary"
          >
            {saveMutation.isPending ? 'Saving…' : editId ? 'Update' : 'Add Document'}
          </button>
        </form>
      )}

      {/* ── Document list ── */}
      <Reveal delay={180}>
      <div className="ui-card p-0 overflow-hidden">
        <div className="ui-toolbar">
          <p className="ui-toolbar-title">All Documents ({docs.length})</p>
        </div>

        {isLoading ? (
          <div className="px-5 py-4"><SkeletonRows count={4} /></div>
        ) : docs.length === 0 ? (
          <p className="ui-empty px-5 py-6">No documents added yet. Add your licences and permits to track their expiry.</p>
        ) : (
          <div className="ui-record-list">
            {docs.map(doc => (
              <div key={doc.id} className="ui-record-row">
                <div className="ui-record-row__main">
                  <div className="ui-record-row__title">
                    <p className="text-sm font-medium text-slate-800">{doc.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[doc.status]}`}>
                      {doc.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="ui-record-row__meta">
                    <p className="text-xs text-slate-400">{doc.docType}</p>
                    <span className="text-xs text-slate-300">·</span>
                    <p className="text-xs text-slate-400">Expires: {fmtDate(doc.expiryDate)}</p>
                    {doc.notes && <><span className="text-xs text-slate-300">·</span><p className="text-xs text-slate-400 truncate">{doc.notes}</p></>}
                  </div>
                </div>
                <div className="ui-record-row__actions">
                  <button
                    onClick={() => startEdit(doc)}
                    className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-500 hover:text-blue-700"
                  >
                    Edit
                  </button>
                  {isOwner && (
                    <button
                      onClick={() => deleteMutation.mutate(doc.id)}
                      disabled={deleteMutation.isPending}
                      className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </Reveal>
    </div>
  )
}
