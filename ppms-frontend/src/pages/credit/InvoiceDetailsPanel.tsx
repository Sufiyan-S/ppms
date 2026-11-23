import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { creditApi } from '../../api/creditApi'
import type { CreditInvoice } from '../../api/creditApi'
import { SidePanel } from '../../components/layout/SidePanel'
import { MoneyText } from '../../components/AmountText'
import { StatusBadge } from '../../components/StatusBadge'
import { invoiceStatusBadge } from '../../components/statusBadges'
import { formatIstDate } from '../../utils/date'

interface InvoiceDetailsPanelProps {
  pumpId: number
  invoice: CreditInvoice
  canCancel: boolean
  onCancel: (invoice: CreditInvoice) => void
  onClose: () => void
}

function FigureList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-border rounded-card border border-border">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 px-3 py-2">
          <dt className="text-ink-2">{label}</dt>
          <dd className="text-right font-semibold text-ink break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** An invoice's parties and GST totals, with the printable copy one click away. */
export function InvoiceDetailsPanel({ pumpId, invoice, canCancel, onCancel, onClose }: InvoiceDetailsPanelProps) {
  const { t } = useTranslation(['credit', 'common'])
  const money = (value: number) => <MoneyText value={value} />

  return (
    <SidePanel
      title={invoice.invoiceNumber}
      subtitle={t('invoices.periodIssued', {
        from: formatIstDate(invoice.periodFrom), to: formatIstDate(invoice.periodTo), issued: formatIstDate(invoice.issuedOn),
      })}
      onClose={onClose}
      bodyClassName="space-y-4 text-sm"
      footer={<>
        {canCancel && invoice.status === 'ISSUED' && (
          <button type="button" onClick={() => onCancel(invoice)} className="ui-btn ui-btn-danger">
            {t('invoicePanel.cancelInvoice')}
          </button>
        )}
        <a href={creditApi.invoicePrintUrl(pumpId, invoice.id)} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-primary">
          {t('invoices.viewPrint')}
        </a>
      </>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge {...invoiceStatusBadge(invoice.status)} />
        {invoice.cancelReason && <span className="text-ink-2">{t('invoices.cancelReason', { reason: invoice.cancelReason })}</span>}
      </div>
      <FigureList rows={[
        [t('invoicePanel.seller'), invoice.sellerLegalName],
        [t('invoicePanel.sellerGstin'), invoice.sellerGstin],
        [t('invoicePanel.buyer'), invoice.buyerName],
        [t('invoicePanel.buyerGstin'), invoice.buyerGstin ?? t('invoicePanel.unregistered')],
        [t('invoicePanel.placeOfSupply'), invoice.placeOfSupplyStateCode],
      ]} />
      <FigureList rows={[
        [t('invoicePanel.fuelTotal'), money(invoice.fuelTotal)],
        [t('invoicePanel.taxableTotal'), money(invoice.taxableTotal)],
        [t('invoicePanel.cgst'), money(invoice.cgstTotal)],
        [t('invoicePanel.sgst'), money(invoice.sgstTotal)],
        [t('invoicePanel.igst'), money(invoice.igstTotal)],
        [t('invoicePanel.grandTotal'), money(invoice.grandTotal)],
      ]} />
    </SidePanel>
  )
}
