import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { BalanceSheetDetail, MeterAmendmentLine } from '../../../api/balanceSheetApi'
import { Td } from '../bsTableCells'
import { FUEL_BADGE, bsColumn, fmtIstTime } from '../bsFormat'
import { DataTable } from '../../../components/DataTable'
import type { DataTableColumn } from '../../../components/DataTable'
import { codeLabel } from '../../../constants/labels'

function amendmentColumns(t: TFunction<['balancesheet', 'common']>): DataTableColumn<MeterAmendmentLine>[] {
  return [
    bsColumn('fuel', t('columns.fuel')),
    bsColumn('type', t('columns.type')),
    bsColumn('previous', t('columns.previous'), true),
    bsColumn('new', t('columns.new'), true),
    bsColumn('change', t('columns.change'), true),
    bsColumn('reason', t('common:fields.reason')),
    bsColumn('by', t('columns.by')),
    bsColumn('time', t('columns.time')),
  ]
}

export function MeterAmendmentsSection({ detail }: { detail: BalanceSheetDetail }) {
  const { t } = useTranslation(['balancesheet', 'common'])
  return (
    <section>
      <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-3">
        {t('meter.title')}
        <span className="ml-2 text-ink-3 normal-case font-normal">
          {t('meter.count', { count: detail.meterAmendments.length })}
        </span>
      </h3>
      <DataTable
        caption={t('meter.caption')}
        captionHidden
        regionLabel={t('meter.region')}
        columns={amendmentColumns(t)}
        rows={detail.meterAmendments}
        rowKey={(a) => a.id}
        renderRow={(a) => {
          const badge = FUEL_BADGE[a.fuelType] ?? 'bg-surface-sunken text-ink-2'
          const deltaColor = a.delta < 0 ? 'text-bad' : a.delta > 0 ? 'text-warn' : 'text-ink-3'
          return (
            <tr>
              <Td>
                <span className={`inline-block px-2 py-0.5 rounded-badge text-xs font-medium ${badge}`}>
                  {codeLabel(a.fuelType)}
                </span>
              </Td>
              <Td>
                <span className="text-xs font-medium text-ink-2">
                  {a.adjustmentType === 'RESET' ? t('meter.resetToZero') : t('meter.custom')}
                </span>
              </Td>
              <Td right><span className="font-mono text-ink-2">{a.previousReading.toFixed(2)}</span></Td>
              <Td right><span className="font-mono text-ink font-medium">{a.newReading.toFixed(2)}</span></Td>
              <Td right>
                <span className={`font-medium ${deltaColor}`}>
                  {a.delta > 0 ? '+' : ''}{a.delta.toFixed(2)}
                </span>
              </Td>
              <Td><span className="text-xs text-ink-3">{a.reason}</span></Td>
              <Td><span className="text-xs text-ink-3">{a.recordedByUserName}</span></Td>
              <Td>
                <span className="text-xs text-ink-3">
                  {fmtIstTime(a.createdAt)}
                </span>
              </Td>
            </tr>
          )
        }}
      />
    </section>
  )
}
