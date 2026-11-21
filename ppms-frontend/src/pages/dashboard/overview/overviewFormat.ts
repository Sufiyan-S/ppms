

export const MAX_CHART_DAYS = 30

function todayIstStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function isPriceStale(prices: { effectiveFrom: string }[]) {
  const today = todayIstStr()
  return prices.length === 0 || prices.some((p) => {
    const istDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(p.effectiveFrom))
    return istDate < today
  })
}

export function fmtAmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// ── Live shift board row ───────────────────────────────────────────────────────

export function timeOpen(startTime: string): string {
  const mins = Math.floor((Date.now() - new Date(startTime).getTime()) / 60_000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}
