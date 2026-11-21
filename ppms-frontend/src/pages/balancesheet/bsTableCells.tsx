import type { ReactNode } from 'react'
import { useAuthStore } from '../../store/authStore'
import type { BsFuelLine, BsShiftLine, NozzleReadingLine } from '../../api/balanceSheetApi'
import { FUEL_BADGE, fmtLitres, fmtMoney } from './bsFormat'
import { codeLabel } from '../../constants/labels'

// ── Table sub-components ────────────────────────────────────────────────────────

export function Th({ children, right, colSpan }: { children?: ReactNode; right?: boolean; colSpan?: number }) {
  return (
    <th scope="col" colSpan={colSpan} className={`px-2 py-2 print:px-1 print:py-1 text-[11px] font-semibold text-slate-500 whitespace-nowrap ${right ? 'text-right' : ''}`}>
      {children}
    </th>
  )
}

export function Td({ children, right, colSpan }: { children?: ReactNode; right?: boolean; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`px-2 py-2 print:px-1 print:py-1 text-slate-700 ${right ? 'text-right whitespace-nowrap tabular-nums' : ''}`}>
      {children}
    </td>
  )
}

export function DiscrepancyTd({ value }: { value: number }) {
  const color = value === 0 ? 'text-emerald-600' : value < 0 ? 'text-red-600' : 'text-amber-600'
  return (
    <td className={`px-2 py-2 print:px-1 print:py-1 text-right font-medium whitespace-nowrap tabular-nums ${color}`}>
      {value === 0 ? '—' : fmtMoney(Math.abs(value))}
      {value !== 0 && <span className="text-xs ml-1">{value < 0 ? 'Short' : 'Over'}</span>}
    </td>
  )
}

export function FuelLineRow({ line }: { line: BsFuelLine }) {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const badge = FUEL_BADGE[line.fuelType] ?? 'bg-slate-100 text-slate-600'
  const profitColor = line.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
      <Td>
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge}`}>
          {codeLabel(line.fuelType)}
        </span>
      </Td>
      <Td right>{fmtLitres(line.openingStock)}</Td>
      <Td right>{line.deliveredLitres > 0 ? fmtLitres(line.deliveredLitres) : <span className="text-slate-500">—</span>}</Td>
      <Td right>{fmtLitres(line.soldLitres)}</Td>
      <Td right>{fmtLitres(line.closingStock)}</Td>
      <Td right>{fmtMoney(line.sellingPrice)}<span className="text-slate-500 text-xs">/L</span></Td>
      <Td right>{fmtMoney(line.expectedRevenue)}</Td>
      {isOwnerOrAdmin && <Td right>{fmtMoney(line.costOfGoods)}</Td>}
      {isOwnerOrAdmin && <Td right><span className={`font-medium ${profitColor}`}>{fmtMoney(line.grossProfit)}</span></Td>}
      <Td right>
        {line.stockVariance === 0 ? (
          <span className="text-slate-500">—</span>
        ) : (
          <span className={`font-medium ${line.stockVariance > 0 ? 'text-amber-600' : 'text-red-600'}`}>
            {line.stockVariance > 0 ? '+' : ''}{line.stockVariance.toFixed(1)} L
          </span>
        )}
      </Td>
      {isOwnerOrAdmin && <Td right>
        {line.dipLossAmount > 0
          ? <span className="text-red-600 font-medium">-{fmtMoney(line.dipLossAmount)}</span>
          : <span className="text-slate-500">—</span>}
      </Td>}
      <Td right>{line.creditSoldAmount > 0 ? fmtMoney(line.creditSoldAmount) : <span className="text-slate-500">—</span>}</Td>
    </tr>
  )
}

export function ShiftLineRow({ line }: { line: BsShiftLine }) {
  const fleetCard = line.fleetCardCollected ?? 0
  return (
    <>
      {/* Shift summary row — shows operator, DU, and all payment totals */}
      <tr className="border-t border-slate-200 hover:bg-slate-50 transition-colors">
        <Td>{line.operatorName}</Td>
        <Td>
          <span className="font-medium text-slate-700">DU #{line.duNumber}</span>
          {line.duName && <span className="text-xs text-slate-500 ml-1">· {line.duName}</span>}
        </Td>
        <Td><span className="text-xs text-slate-500 block max-w-[100px]">{line.fuelTypesSummary}</span></Td>
        <Td right>{fmtLitres(line.litresSold)}</Td>
        <Td right>{fmtMoney(line.expectedRevenue)}</Td>
        <Td right><span className="font-medium text-slate-800">{fmtMoney(line.cashCollected + line.upiCollected + line.cardCollected + fleetCard)}</span></Td>
        <Td right>{line.cashCollected > 0 ? fmtMoney(line.cashCollected) : <span className="text-slate-500">—</span>}</Td>
        <Td right>{line.upiCollected > 0 ? fmtMoney(line.upiCollected) : <span className="text-slate-500">—</span>}</Td>
        <Td right>{line.cardCollected > 0 ? fmtMoney(line.cardCollected) : <span className="text-slate-500">—</span>}</Td>
        <Td right>{fleetCard > 0 ? fmtMoney(fleetCard) : <span className="text-slate-500">—</span>}</Td>
        <Td right>{line.creditAmount > 0 ? fmtMoney(line.creditAmount) : <span className="text-slate-500">—</span>}</Td>
        <DiscrepancyTd value={line.discrepancy} />
      </tr>
      {/* Per-nozzle breakdown rows — one row per nozzle showing fuel type and litres only */}
      {(line.nozzleReadings ?? []).map((nr: NozzleReadingLine, i: number) => {
        const badge = FUEL_BADGE[nr.fuelType] ?? 'bg-slate-100 text-slate-600'
        return (
          <tr key={i} className="border-t border-slate-100 bg-slate-50/40">
            <Td></Td>
            <Td>
              <span className="text-xs text-slate-500 ml-3">↳ Nozzle #{nr.nozzleNumber}</span>
            </Td>
            <Td>
              <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${badge}`}>
                {codeLabel(nr.fuelType)}
              </span>
            </Td>
            <Td right><span className="text-xs text-slate-500">{fmtLitres(nr.litresSold)}</span></Td>
            <Td right><span className="text-xs text-slate-500">{fmtMoney(nr.expectedRevenue)}</span></Td>
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
  value: string
  sublabel?: string
  accent?: 'green' | 'red' | 'amber' | 'blue'
}

export function SummaryTile({ label, value, sublabel, accent }: SummaryTileProps) {
  const accentMap = {
    green: 'text-emerald-600',
    red:   'text-red-600',
    amber: 'text-amber-600',
    blue:  'text-blue-600',
  }
  const valueColor = accent ? accentMap[accent] : 'text-slate-800'

  return (
    <div className="ui-card-plain bg-white px-4 py-3">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-base font-semibold ${valueColor}`}>{value}</p>
      {sublabel && <p className={`text-xs mt-0.5 ${valueColor}`}>{sublabel}</p>}
    </div>
  )
}
