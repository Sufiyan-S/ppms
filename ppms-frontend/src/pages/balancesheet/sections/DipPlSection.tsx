import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { BalanceSheetDetail, DipPlLine } from '../../../api/balanceSheetApi'
import { Td } from '../bsTableCells'
import { FUEL_BADGE, bsColumn, fmtIstTime, fmtLitres } from '../bsFormat'
import { DataTable } from '../../../components/DataTable'
import type { DataTableColumn } from '../../../components/DataTable'
import { StatusBadge } from '../../../components/StatusBadge'
import { MoneyText } from '../../../components/AmountText'
import type { StatusTone } from '../../../components/StatusBadge'
import { codeLabel } from '../../../constants/labels'

function dipColumns(t: TFunction<['balancesheet', 'common']>): DataTableColumn<DipPlLine>[] {
  return [
    bsColumn('type', t('columns.type')),
    bsColumn('fuel', t('columns.fuel')),
    bsColumn('litres', t('columns.litres'), true),
    bsColumn('pl', t('columns.profitLoss'), true),
    bsColumn('time', t('columns.time')),
    bsColumn('notes', t('common:fields.notes')),
  ]
}

function signTone(value: number): StatusTone {
  return value > 0 ? 'ok' : value < 0 ? 'bad' : 'neutral'
}

export function DipPlSection({ detail }: { detail: BalanceSheetDetail }) {
  const { t } = useTranslation(['balancesheet', 'common'])
  return (
    <section>
      <h3 className="ui-section-heading mb-3">
        {t('dip.title')}
        <span className="ml-2 font-normal text-ink-3">
          {t('dip.count', { count: detail.dipPlEntries.length })}
        </span>
      </h3>
      <DataTable
        caption={t('dip.title')}
        captionHidden
        regionLabel={t('dip.region')}
        columns={dipColumns(t)}
        rows={detail.dipPlEntries}
        rowKey={(entry) => `${entry.type}-${entry.fuelType}-${entry.recordedAt}`}
        renderRow={(entry) => {
          const badge = FUEL_BADGE[entry.fuelType] ?? 'bg-surface-sunken text-ink-2'
          const litresColor = entry.type === 'DIP_CHECK'
            ? (entry.litres > 0 ? 'text-ok' : entry.litres < 0 ? 'text-bad' : 'text-ink-3')
            : 'text-ink'
          return (
            <tr>
              <Td>
                {entry.type === 'DIP_CHECK'
                  ? <StatusBadge tone="info" label={t('dip.dipCheck')} />
                  : <StatusBadge tone="warn" label={t('dip.maintenance')} />}
              </Td>
              <Td>
                <span className={`inline-block px-2 py-0.5 rounded-badge text-xs font-medium ${badge}`}>
                  {codeLabel(entry.fuelType)}
                </span>
              </Td>
              <Td right>
                <span className={`font-mono ${litresColor}`}>
                  {entry.type === 'DIP_CHECK' && entry.litres > 0 ? '+' : ''}{fmtLitres(entry.litres)}
                </span>
              </Td>
              <Td right>
                <MoneyText value={entry.monetaryAmount} showSign tone={signTone(entry.monetaryAmount)} className="font-medium" />
              </Td>
              <Td>
                <span className="text-xs text-ink-3">
                  {fmtIstTime(entry.recordedAt)}
                </span>
              </Td>
              <Td>
                <span className="text-xs text-ink-3 max-w-40 truncate block" title={entry.notes ?? ''}>
                  {entry.notes ?? '—'}
                </span>
              </Td>
            </tr>
          )
        }}
        footer={
          <tr className="bg-surface-sunken">
            <Td colSpan={3}>{t('dip.net')}</Td>
            <Td right>
              <MoneyText value={detail.totalDipNetAmount} showSign tone={signTone(detail.totalDipNetAmount)} />
            </Td>
            <Td colSpan={2} />
          </tr>
        }
      />
    </section>
  )
}
