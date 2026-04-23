import client from './client'
import type { PagedResponse } from '../types/paged'

export type UnitOfMeasure = 'LITRE' | 'KG' | 'PIECE'
export type AncillaryProductStatus = 'ACTIVE' | 'INACTIVE'
export type AncillaryLotStatus = 'ACTIVE' | 'EXHAUSTED'
export type AncillaryPaymentMode = 'CASH' | 'UPI' | 'CARD' | 'FLEET_CARD' | 'CREDIT'

export interface AncillaryProduct {
  id: number
  pumpId: number
  name: string
  brand: string | null
  variant: string | null
  packageSize: number
  unitOfMeasure: UnitOfMeasure
  currentStockUnits: number
  lowStockThreshold: number | null
  status: AncillaryProductStatus
  /** Cost price of the oldest active FIFO lot. Null when out of stock. */
  fifoCostPricePerUnit: number | null
  /**
   * All active FIFO lots in consumption order (oldest first).
   * Used by the SellDialog to compute accurate multi-batch projected profit.
   */
  activeFifoLots: { remainingQuantity: number; costPricePerUnit: number }[]
  displayName: string
  createdAt: string
  updatedAt: string
}

export interface AncillaryProductPrice {
  id: number
  productId: number
  pumpId: number
  pricePerUnit: number
  effectiveFrom: string
  setByUserId: number
}

export interface AncillaryStockDelivery {
  id: number
  productId: number
  pumpId: number
  quantityUnits: number
  costPricePerUnit: number
  deliveryDate: string
  invoiceReference: string | null
  notes: string | null
  loggedByUserId: number
  /** True when the delivery was recorded with a past date (historical stock entry). */
  isBackfilled: boolean
  createdAt: string
}

export interface AncillarySale {
  id: number
  pumpId: number
  productId: number
  productDisplayName: string
  quantityUnits: number
  sellingPricePerUnit: number
  totalAmount: number
  paymentMode: AncillaryPaymentMode
  clientId: number | null
  clientName: string | null
  billNo: string | null
  notes: string | null
  soldByUserId: number
  saleDate: string
  /** True when this sale was entered retroactively for a historical date. */
  isBackfilled: boolean
  createdAt: string
}

export interface CreateProductRequest {
  name: string
  brand?: string
  variant?: string
  packageSize: number
  unitOfMeasure: UnitOfMeasure
  lowStockThreshold?: number
}

export interface UpdateProductRequest {
  brand?: string
  variant?: string
  lowStockThreshold?: number | null
}

export interface SetProductPriceRequest {
  pricePerUnit: number
}

export interface RecordStockDeliveryRequest {
  quantityUnits: number
  costPricePerUnit: number
  deliveryDate: string   // YYYY-MM-DD
  invoiceReference?: string
  notes?: string
}

export interface AncillaryLotDetail {
  id: number
  deliveryId: number
  deliveryDate: string
  /** Invoice / bill number from the stock-in delivery. Null if not recorded at delivery time. */
  invoiceReference: string | null
  costPricePerUnit: number
  remainingQuantity: number
  originalQuantity: number
  status: AncillaryLotStatus
  createdAt: string
}

export interface UpdateLotRequest {
  costPricePerUnit?: number
  remainingQuantity?: number
}

export interface RecordAncillarySaleRequest {
  productId: number
  quantityUnits: number
  /** MRP entered by operator at point of sale — inclusive of all taxes, no GST added on top. */
  sellingPricePerUnit: number
  paymentMode: AncillaryPaymentMode
  clientId?: number
  clientName?: string
  billNo?: string
  notes?: string
}

/**
 * Request for retroactively recording a historical counter sale.
 * The selling price is NOT sent — the backend resolves it from the product's price
 * history for the given saleDate. saleDate must be strictly before today.
 */
export interface BackfillSaleRequest {
  productId: number
  /** YYYY-MM-DD, must be strictly before today */
  saleDate: string
  quantityUnits: number
  paymentMode: AncillaryPaymentMode
  /** Required when paymentMode is CREDIT */
  clientName?: string
  billNo?: string
  notes?: string
}

export const ancillaryApi = {
  getProducts: (pumpId: number): Promise<AncillaryProduct[]> =>
    client.get(`/pumps/${pumpId}/ancillary/products`).then(r => r.data),

  createProduct: (pumpId: number, data: CreateProductRequest): Promise<AncillaryProduct> =>
    client.post(`/pumps/${pumpId}/ancillary/products`, data).then(r => r.data),

  updateProduct: (pumpId: number, id: number, data: UpdateProductRequest): Promise<AncillaryProduct> =>
    client.patch(`/pumps/${pumpId}/ancillary/products/${id}`, data).then(r => r.data),

  setProductStatus: (pumpId: number, id: number, status: AncillaryProductStatus): Promise<AncillaryProduct> =>
    client.patch(`/pumps/${pumpId}/ancillary/products/${id}/status`, null, { params: { status } }).then(r => r.data),

  getPriceHistory: (pumpId: number, productId: number): Promise<AncillaryProductPrice[]> =>
    client.get(`/pumps/${pumpId}/ancillary/products/${productId}/prices`).then(r => r.data),

  setPrice: (pumpId: number, productId: number, data: SetProductPriceRequest): Promise<AncillaryProductPrice> =>
    client.post(`/pumps/${pumpId}/ancillary/products/${productId}/prices`, data).then(r => r.data),

  recordDelivery: (pumpId: number, productId: number, data: RecordStockDeliveryRequest): Promise<AncillaryStockDelivery> =>
    client.post(`/pumps/${pumpId}/ancillary/products/${productId}/deliveries`, data).then(r => r.data),

  getDeliveries: (pumpId: number, page = 0, size = 10): Promise<PagedResponse<AncillaryStockDelivery>> =>
    client.get(`/pumps/${pumpId}/ancillary/deliveries`, { params: { page, size } }).then(r => r.data),

  recordSale: (pumpId: number, data: RecordAncillarySaleRequest): Promise<AncillarySale> =>
    client.post(`/pumps/${pumpId}/ancillary/sales`, data).then(r => r.data),

  getSales: (pumpId: number, page = 0, size = 10): Promise<PagedResponse<AncillarySale>> =>
    client.get(`/pumps/${pumpId}/ancillary/sales`, { params: { page, size } }).then(r => r.data),

  getLots: (pumpId: number, productId: number): Promise<AncillaryLotDetail[]> =>
    client.get(`/pumps/${pumpId}/ancillary/products/${productId}/lots`).then(r => r.data),

  updateLot: (pumpId: number, lotId: number, data: UpdateLotRequest): Promise<AncillaryLotDetail> =>
    client.patch(`/pumps/${pumpId}/ancillary/lots/${lotId}`, data).then(r => r.data),

  backfillSale: (pumpId: number, data: BackfillSaleRequest): Promise<AncillarySale> =>
    client.post(`/pumps/${pumpId}/ancillary/sales/backfill`, data).then(r => r.data),
}
