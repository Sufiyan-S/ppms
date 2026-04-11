import client from './client'

export interface FuelSupplier {
  id: number
  pumpId: number
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  notes: string | null
  active: boolean
  createdAt: string
}

export interface UpsertSupplierRequest {
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  notes: string | null
}

export const supplierApi = {
  getSuppliers: (pumpId: number): Promise<FuelSupplier[]> =>
    client.get(`/pumps/${pumpId}/suppliers`).then(r => r.data),

  createSupplier: (pumpId: number, data: UpsertSupplierRequest): Promise<FuelSupplier> =>
    client.post(`/pumps/${pumpId}/suppliers`, data).then(r => r.data),

  updateSupplier: (pumpId: number, supplierId: number, data: UpsertSupplierRequest): Promise<FuelSupplier> =>
    client.put(`/pumps/${pumpId}/suppliers/${supplierId}`, data).then(r => r.data),

  deactivateSupplier: (pumpId: number, supplierId: number): Promise<void> =>
    client.delete(`/pumps/${pumpId}/suppliers/${supplierId}`).then(r => r.data),
}
