import client from './client'
import type { PagedResponse } from '../types/paged'

export interface TankStock {
  tankId: number
  tankIdentifier: string
  fuelType: 'PETROL' | 'DIESEL' | 'CNG'
  capacity: number
  currentStock: number
  stockPercentage: number
  lowStock: boolean
  dipTolerance: number
  pumpId: number
}

export interface TankerDelivery {
  id: number
  pumpId: number
  tankId: number
  tankIdentifier: string
  fuelType: string
  quantityDelivered: number
  costPricePerUnit: number
  totalCost: number
  deliveryDate: string
  invoiceReference: string
  loggedByUserName: string
  createdAt: string
}

export interface RecordDeliveryRequest {
  tankId: number
  quantityDelivered: number
  costPricePerUnit: number
  deliveryDate: string   // YYYY-MM-DD
  invoiceReference: string
}

export interface UpdateDeliveryRequest {
  quantityDelivered: number
  costPricePerUnit: number
  deliveryDate: string   // YYYY-MM-DD
  invoiceReference: string
}

export interface RecordBatchDeliveryRequest {
  deliveryDate: string   // YYYY-MM-DD
  invoiceReference: string
  items: Array<{
    tankId: number
    quantityDelivered: number
    costPricePerUnit: number
  }>
}

export interface DipCheck {
  id: number
  tankId: number
  tankIdentifier: string
  fuelType: string
  measuredQuantity: number
  systemStock: number
  variance: number
  notes: string | null
  checkedAt: string
  loggedByUserName: string
  checkedByUserName: string | null
  createdAt: string
  status: 'WITHIN_TOLERANCE' | 'PENDING_REVIEW' | 'REVIEWED'
  reviewedAt: string | null
  reviewedByUserName: string | null
}

export interface InventoryLotDetail {
  id: number
  tankerDeliveryId: number | null
  deliveryDate: string
  /** Invoice / bill number from the tanker delivery. Null for DIP-adjustment lots. */
  invoiceReference: string | null
  costPricePerUnit: number
  remainingQuantity: number
  originalQuantity: number
  /** True when this lot came from a DIP upward adjustment — no invoice, cost = 0. */
  isDipAdjustment: boolean
  status: 'ACTIVE'
  createdAt: string
}

export interface RecordDipCheckRequest {
  tankId: number
  measuredQuantity: number
  checkedAt: string   // YYYY-MM-DD
  checkedByUserId?: number
  notes?: string
}

export const inventoryApi = {
  getTankStocks: (pumpId: number) =>
    client.get<TankStock[]>(`/inventory/${pumpId}/tanks`).then(r => r.data),

  recordDelivery: (pumpId: number, req: RecordDeliveryRequest) =>
    client.post<TankerDelivery>(`/inventory/${pumpId}/deliveries`, req).then(r => r.data),

  recordBatchDelivery: (pumpId: number, req: RecordBatchDeliveryRequest) =>
    client.post<TankerDelivery[]>(`/inventory/${pumpId}/deliveries/batch`, req).then(r => r.data),

  getDeliveries: (pumpId: number, page = 0, size = 10) =>
    client.get<PagedResponse<TankerDelivery>>(`/inventory/${pumpId}/deliveries`, { params: { page, size } }).then(r => r.data),

  updateDelivery: (pumpId: number, deliveryId: number, req: UpdateDeliveryRequest) =>
    client.patch<TankerDelivery>(`/inventory/${pumpId}/deliveries/${deliveryId}`, req).then(r => r.data),

  recordDipCheck: (pumpId: number, req: RecordDipCheckRequest) =>
    client.post<DipCheck>(`/inventory/${pumpId}/dip-checks`, req).then(r => r.data),

  getDipChecks: (pumpId: number, page = 0, size = 10) =>
    client.get<PagedResponse<DipCheck>>(`/inventory/${pumpId}/dip-checks`, { params: { page, size } }).then(r => r.data),

  reviewDipCheck: (pumpId: number, dipCheckId: number) =>
    client.patch<DipCheck>(`/inventory/${pumpId}/dip-checks/${dipCheckId}/review`).then(r => r.data),

  getActiveTankLots: (pumpId: number, tankId: number): Promise<InventoryLotDetail[]> =>
    client.get(`/inventory/${pumpId}/tanks/${tankId}/lots`).then(r => r.data),
}
