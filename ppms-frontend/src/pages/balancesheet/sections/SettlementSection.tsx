import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { SettlementSummary } from '../../../api/balanceSheetApi'
import { Td } from '../bsTableCells'
import { bsColumn } from '../bsFormat'
import { DataTable } from '../../../components/DataTable'
import type { DataTableColumn } from '../../../components/DataTable'
import { MoneyText } from '../../../components/AmountText'

type BalanceSheetT = TFunction<['balancesheet', 'common']>

function paymentTypeLabel(t: BalanceSheetT, type: string): string {
  if (type === 'UPI') return t('common:paymentMethods.UPI')
  if (type === 'CARD') return t('common:paymentMethods.CARD')
  if (type === 'FLEET_CARD') return t('common:paymentMethods.FLEET_CARD')
  return type
}

interface SettlementRow {
  type: string
  settled: number
  pending: number
}

function settlementColumns(t: BalanceSheetT): DataTableColumn<SettlementRow>[] {
  return [
    bsColumn('type', t('columns.paymentType')),
    bsColumn('settled', t('columns.settledOnDate'), true),
    bsColumn('pending', t('columns.walletPending'), true),
  ]
}

// ── Payment settlement section (DAY reports only) ──────────────────────────────

export function SettlementSection({ summary }: { summary: SettlementSummary }) {
  const { t } = useTranslation(['balancesheet', 'common'])
  const rows: SettlementRow[] = [
    { type: 'UPI',        settled: summary.upiSettledOnDate,        pending: summary.walletUpiPending },
    { type: 'CARD',       settled: summary.cardSettledOnDate,        pending: summary.walletCardPending },
    { type: 'FLEET_CARD', settled: summary.fleetCardSettledOnDate,   pending: summary.walletFleetCardPending },
  ]

  const totalSettled = rows.reduce((s, r) => s + r.settled, 0)
  const totalPending = rows.reduce((s, r) => s + r.pending, 0)

  return (
    <section className="mt-6 space-y-3">
      <h3 className="ui-section-heading">
        {t('settlements.title')}
      </h3>
      <DataTable
        caption={t('settlements.caption')}
        captionHidden
        columns={settlementColumns(t)}
        rows={rows}
        rowKey={(r) => r.type}
        renderRow={(r) => (
          <tr>
            <Td>{paymentTypeLabel(t, r.type)}</Td>
            <Td right>
              {r.settled > 0
                ? <MoneyText value={r.settled} tone="ok" className="font-medium" />
                : <span className="text-ink-3">—</span>
              }
            </Td>
            <Td right>
              {r.pending !== 0
                ? <MoneyText value={r.pending} tone={r.pending > 0 ? 'warn' : 'ok'} className={r.pending > 0 ? 'font-medium' : ''} />
                : <span className="inline-flex items-center gap-1 text-ink-3">{t('settlements.settled')}<Check size={11} strokeWidth={2.5} /></span>
              }
            </Td>
          </tr>
        )}
        footer={
          <tr className="bg-surface-sunken">
            <Td>{t('common:fields.total')}</Td>
            <Td right>{totalSettled > 0 ? <MoneyText value={totalSettled} /> : '—'}</Td>
            <Td right><MoneyText value={totalPending} tone={totalPending > 0 ? 'warn' : 'ok'} /></Td>
          </tr>
        }
      />
      {summary.settlementsOnDate.length > 0 && (
        <div className="ui-card-plain ui-card-muted p-3 text-sm">
          <p className="ui-kpi-label mb-2">{t('settlements.recordedOnDate')}</p>
          <div className="space-y-1">
            {summary.settlementsOnDate.map(s => (
              <div key={s.id} className="flex items-center gap-3 text-xs text-ink-2">
                <span className="font-medium">{paymentTypeLabel(t, s.paymentType)}</span>
                <MoneyText value={s.amountReceived} tone="ok" className="font-semibold" />
                {s.notes && <span className="text-ink-3">· {s.notes}</span>}
                <span className="text-ink-3 ml-auto">{t('settlements.recordedBy', { name: s.recordedByUserName })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
