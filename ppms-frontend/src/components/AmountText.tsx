import { formatCurrency, formatLitres, formatWithSign } from '../utils/format'
import type { StatusTone } from './StatusBadge'

const TONE_TEXT: Record<StatusTone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
  info: 'text-info',
  neutral: 'text-neutral',
}

interface AmountTextProps {
  /** null or undefined shows a dash. */
  value: number | null | undefined
  /** Show "+" or "−" in front; the number itself is then shown without its minus. */
  showSign?: boolean
  tone?: StatusTone
  className?: string
}

function AmountText({ value, showSign = false, tone, className = '', format }: AmountTextProps & { format: (n: number) => string }) {
  const text = value == null ? '—' : showSign ? formatWithSign(Number(value), format) : format(Number(value))
  return (
    <span className={`whitespace-nowrap tabular-nums ${tone ? TONE_TEXT[tone] : ''} ${className}`}>{text}</span>
  )
}

/** Rupees with en-IN grouping and 2 decimals: ₹1,23,456.00. */
export function MoneyText(props: AmountTextProps) {
  return <AmountText {...props} format={formatCurrency} />
}

/** Litres with the unit, 3 decimals unless told otherwise: 1,234.567 L. */
export function LitresText({ decimals = 3, ...props }: AmountTextProps & { decimals?: number }) {
  return <AmountText {...props} format={(n) => formatLitres(n, decimals)} />
}
