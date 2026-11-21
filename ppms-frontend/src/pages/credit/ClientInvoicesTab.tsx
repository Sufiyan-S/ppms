import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { creditApi } from '../../api/creditApi'
import type { CreditInvoice, InvoicePeriod } from '../../api/creditApi'
import { Pagination } from '../../components/Pagination'
import { SkeletonRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { formatIstDate } from '../../utils/date'
import { formatCurrency } from '../../utils/format'
import { CancelInvoiceModal } from './modals/CancelInvoiceModal'

// ─── Client Invoices Tab ─────────────────────────────────────────────────────

interface ClientInvoicesTabProps {
  pumpId: number
  clientId: number
  canIssueInvoices: boolean
}

const shortDate = (date: string) => formatIstDate(date, { day: '2-digit', month: 'short', year: 'numeric' })

export function ClientInvoicesTab({ pumpId, clientId, canIssueInvoices }: ClientInvoicesTabProps) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [cancelling, setCancelling] = useState<CreditInvoice | null>(null)

  const { data: defaultPeriod } = useQuery({
    queryKey: ['credit-invoice-default-period', pumpId, clientId],
    queryFn: () => creditApi.getDefaultInvoicePeriod(pumpId, clientId),
    enabled: canIssueInvoices,
  })

  const { data: invoices, isLoading, isError } = useQuery({
    queryKey: ['credit-invoices', pumpId, clientId, page, pageSize],
    queryFn: () => creditApi.listInvoices(pumpId, clientId, page, pageSize),
  })

  return (
    <div className="space-y-4">
      {cancelling && (
        <CancelInvoiceModal invoice={cancelling} pumpId={pumpId} onClose={() => setCancelling(null)} />
      )}

      {canIssueInvoices && defaultPeriod && (
        <GenerateInvoiceForm pumpId={pumpId} clientId={clientId} defaultPeriod={defaultPeriod}
          onGenerated={() => setPage(0)} />
      )}

      {isLoading ? (
        <SkeletonRows count={3} />
      ) : isError ? (
        <p role="alert" className="ui-alert ui-alert-danger text-sm">Could not load invoices. Please try again.</p>
      ) : !invoices || invoices.content.length === 0 ? (
        <EmptyState icon="transactions" title="No invoices yet"
          subtitle={canIssueInvoices ? 'Generate one for a billing period above.' : undefined} />
      ) : (
        <>
          <ul className="space-y-2" aria-label="Invoices">
            {invoices.content.map(invoice => (
              <li key={invoice.id} className="ui-card-plain px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">{invoice.invoiceNumber}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      invoice.status === 'CANCELLED' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {invoice.status === 'CANCELLED' ? 'Cancelled' : 'Issued'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {shortDate(invoice.periodFrom)} – {shortDate(invoice.periodTo)} · issued {shortDate(invoice.issuedOn)}
                  </p>
                  {invoice.cancelReason && (
                    <p className="text-xs text-red-700 mt-0.5">Reason: {invoice.cancelReason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-800">{formatCurrency(invoice.grandTotal)}</span>
                  <a
                    href={creditApi.invoicePrintUrl(pumpId, invoice.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ui-btn ui-btn-secondary min-h-0 px-3 py-1.5 text-xs"
                    aria-label={`View or print invoice ${invoice.invoiceNumber}`}
                  >
                    View / Print
                  </a>
                  {canIssueInvoices && invoice.status === 'ISSUED' && (
                    <button type="button" onClick={() => setCancelling(invoice)}
                      className="ui-btn ui-btn-ghost min-h-0 px-3 py-1.5 text-xs text-red-600 border border-red-200"
                      aria-label={`Cancel invoice ${invoice.invoiceNumber}`}>
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            data={invoices}
            onPageChange={setPage}
            onPageSizeChange={size => { setPageSize(size); setPage(0) }}
          />
        </>
      )}
    </div>
  )
}

interface GenerateInvoiceFormProps {
  pumpId: number
  clientId: number
  defaultPeriod: InvoicePeriod
  onGenerated: () => void
}

function GenerateInvoiceForm({ pumpId, clientId, defaultPeriod, onGenerated }: GenerateInvoiceFormProps) {
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [periodFrom, setPeriodFrom] = useState(defaultPeriod.periodFrom)
  const [periodTo, setPeriodTo] = useState(defaultPeriod.periodTo)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => creditApi.generateInvoice(pumpId, clientId, { periodFrom, periodTo }),
    onSuccess: (invoice) => {
      setError(null)
      qc.invalidateQueries({ queryKey: ['credit-invoices', pumpId] })
      addToast(`Invoice ${invoice.invoiceNumber} issued`, 'success')
      onGenerated()
    },
    onError: (err) => setError(parseApiError(err, 'Failed to generate invoice')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!periodFrom || !periodTo) { setError('Choose both dates of the period.'); return }
    if (periodFrom > periodTo) { setError('The period start must be on or before its end.'); return }
    setError(null)
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="ui-card-plain px-4 py-3 space-y-3" aria-label="Generate invoice">
      <p className="text-sm font-semibold text-slate-700">Generate invoice</p>
      <p className="text-xs text-slate-500">
        Bills every credit sale in the period that is not already on an invoice. Interest is not included.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="ui-label">From</span>
          <input type="date" value={periodFrom} max={periodTo || undefined}
            onChange={e => setPeriodFrom(e.target.value)} className="text-sm" />
        </label>
        <label className="block">
          <span className="ui-label">To</span>
          <input type="date" value={periodTo} min={periodFrom || undefined}
            onChange={e => setPeriodTo(e.target.value)} className="text-sm" />
        </label>
      </div>
      {error && <p role="alert" className="ui-error-text">{error}</p>}
      <button type="submit" disabled={mutation.isPending} className="ui-btn ui-btn-primary">
        {mutation.isPending ? <span className="flex items-center gap-1.5"><Spinner />Generating…</span> : 'Generate Invoice'}
      </button>
    </form>
  )
}
