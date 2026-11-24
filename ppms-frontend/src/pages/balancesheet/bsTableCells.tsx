import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'
import type { BsFuelLine, BsShiftLine, NozzleReadingLine } from '../../api/balanceSheetApi'
import { LitresText, MoneyText } from '../../components/AmountText'
import { FUEL_BADGE, fmtLitres } from './bsFormat'
import { codeLabel } from '../../constants/labels'
import { shiftUrl } from '../../utils/drillDown'

// ── Table sub-components ────────────────────────────────────────────────────────

export function Td({ children, right, colSpan }: { children?: ReactNode; right?: boolean; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`px-2 py-2 print:px-1 print:py-1 text-ink ${right ? 'text-right whitespace-nowrap tabular-nums' : ''}`}>
      {children}
    </td>
  )
}

export function DiscrepancyTd({ value }: { value: number }) {
  const { t } = useTranslation('balancesheet')
  const color = value === 0 ? 'text-ok' : value < 0 ? 'text-bad' : 'text-warn'
  return (
    <td className={`px-2 py-2 print:px-1 print:py-1 text-right font-medium whitespace-nowrap tabular-nums ${color}`}>
      {value === 0 ? '—' : <MoneyText value={Math.abs(value)} />}
      {value !== 0 && <span className="text-xs ml-1">{value < 0 ? t('summary.short') : t('summary.over')}</span>}
    </td>
  )
}

/** shiftsHref opens shift history for this fuel over the sheet's period. */
export function FuelLineRow({ line, shiftsHref }: { line: BsFuelLine; shiftsHref?: string }) {
  const { t } = useTranslation('balancesheet')
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const badge = FUEL_BADGE[line.fuelType] ?? 'bg-surface-sunken text-ink-2'

  return (
    <tr>
      <Td>
        <span className={`inline-block px-2 py-0.5 rounded-badge text-xs font-medium ${badge}`}>
          {codeLabel(line.fuelType)}
        </span>
        {shiftsHref && (
          <Link to={shiftsHref} className="ui-link ml-2 text-xs print:hidden" aria-label={t('fuel.viewShifts', { fuel: codeLabel(line.fuelType) })}>
            {t('fuel.shiftsLink')}
          </Link>
        )}
      </Td>
      <Td right><LitresText value={line.openingStock} /></Td>
      <Td right>{line.deliveredLitres > 0 ? <LitresText value={line.deliveredLitres} /> : <span className="text-ink-3">—</span>}</Td>
      <Td right><LitresText value={line.soldLitres} /></Td>
      <Td right><LitresText value={line.closingStock} /></Td>
      <Td right><MoneyText value={line.sellingPrice} /><span className="text-ink-3 text-xs">/L</span></Td>
      <Td right><MoneyText value={line.expectedRevenue} /></Td>
      {isOwnerOrAdmin && <Td right><MoneyText value={line.costOfGoods} /></Td>}
      {isOwnerOrAdmin && <Td right><MoneyText value={line.grossProfit} tone={line.grossProfit >= 0 ? 'ok' : 'bad'} className="font-medium" /></Td>}
      <Td right>
        {line.stockVariance === 0 ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className={`font-medium ${line.stockVariance > 0 ? 'text-warn' : 'text-bad'}`}>
            {line.stockVariance > 0 ? '+' : ''}{fmtLitres(line.stockVariance)}
          </span>
        )}
      </Td>
      {isOwnerOrAdmin && <Td right>
        {line.dipLossAmount > 0
          ? <MoneyText value={-line.dipLossAmount} showSign tone="bad" className="font-medium" />
          : <span className="text-ink-3">—</span>}
      </Td>}
      <Td right>{line.creditSoldAmount > 0 ? <MoneyText value={line.creditSoldAmount} /> : <span className="text-ink-3">—</span>}</Td>
    </tr>
  )
}

function AmountOrDash({ value }: { value: number }) {
  return value > 0 ? <MoneyText value={value} /> : <span className="text-ink-3">—</span>
}

export function ShiftLineRow({ line }: { line: BsShiftLine }) {
  const { t } = useTranslation('balancesheet')
  const fleetCard = line.fleetCardCollected ?? 0
  return (
    <>
      {/* Shift summary row — shows operator, DU, and all payment totals */}
      <tr>
        <Td>
          <Link to={shiftUrl(line.shiftId)} className="ui-link" aria-label={t('shifts.openShift', { id: line.shiftId, name: line.operatorName })}>
            {line.operatorName}
          </Link>
        </Td>
        <Td>
          <span className="font-medium text-ink">{t('shifts.duNumber', { number: line.duNumber })}</span>
          {line.duName && <span className="text-xs text-ink-3 ml-1">· {line.duName}</span>}
        </Td>
        <Td><span className="text-xs text-ink-3 block max-w-25">{line.fuelTypesSummary}</span></Td>
        <Td right><LitresText value={line.litresSold} /></Td>
        <Td right><MoneyText value={line.expectedRevenue} /></Td>
        <Td right><MoneyText value={line.cashCollected + line.upiCollected + line.cardCollected + fleetCard} className="font-medium text-ink" /></Td>
        <Td right><AmountOrDash value={line.cashCollected} /></Td>
        <Td right><AmountOrDash value={line.upiCollected} /></Td>
        <Td right><AmountOrDash value={line.cardCollected} /></Td>
        <Td right><AmountOrDash value={fleetCard} /></Td>
        <Td right><AmountOrDash value={line.creditAmount} /></Td>
        <DiscrepancyTd value={line.discrepancy} />
      </tr>
      {/* Per-nozzle breakdown rows — one row per nozzle showing fuel type and litres only */}
      {(line.nozzleReadings ?? []).map((nr: NozzleReadingLine, i: number) => {
        const badge = FUEL_BADGE[nr.fuelType] ?? 'bg-surface-sunken text-ink-2'
        return (
          <tr key={i} className="bg-surface-sunken">
            <Td></Td>
            <Td>
              <span className="text-xs text-ink-3 ml-3">{t('shifts.nozzle', { number: nr.nozzleNumber })}</span>
            </Td>
            <Td>
              <span className={`inline-block px-1.5 py-0.5 rounded-badge text-xs font-medium ${badge}`}>
                {codeLabel(nr.fuelType)}
              </span>
            </Td>
            <Td right><LitresText value={nr.litresSold} className="text-xs text-ink-3" /></Td>
            <Td right><MoneyText value={nr.expectedRevenue} className="text-xs text-ink-3" /></Td>
            <Td colSpan={7}></Td>
          </tr>
        )
      })}
    </>
  )
}

// ── Summary tile ────────────────────────────────────────────────────────────────

interface SummaryTileProps {
  label: string
  value: ReactNode
  sublabel?: string
  accent?: 'green' | 'red' | 'amber' | 'blue'
}

export function SummaryTile({ label, value, sublabel, accent }: SummaryTileProps) {
  const accentMap = {
    green: 'text-ok',
    red:   'text-bad',
    amber: 'text-warn',
    blue:  'text-primary',
  }
  const valueColor = accent ? accentMap[accent] : 'text-ink'

  return (
    <div className="ui-card-plain bg-surface px-4 py-3">
      <p className="text-xs text-ink-3 mb-1">{label}</p>
      <p className={`text-base font-semibold ${valueColor}`}>{value}</p>
      {sublabel && <p className={`text-xs mt-0.5 ${valueColor}`}>{sublabel}</p>}
    </div>
  )
}
