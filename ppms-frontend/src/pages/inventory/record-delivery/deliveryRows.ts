

// ── Record Delivery Modal ─────────────────────────────────────────────────────

export interface DeliveryRow {
  id: number
  tankId: string
  qty: string
  costPrice: string
}

export interface PreparedDeliveryItem {
  tankId: number
  tankIdentifier: string
  fuelType: string
  quantityDelivered: number
  costPricePerUnit: number
  totalCost: number
  stockAfter: number | null
  capacity: number | null
}

export let _rowSeq = 0

export function newRow(defaultTankId = ''): DeliveryRow {
  return { id: ++_rowSeq, tankId: defaultTankId, qty: '', costPrice: '' }
}
