import client from './client'

export type AdjustmentType = 'RESET' | 'CUSTOM_READING'

export interface NozzleReadingAdjustment {
  id: number
  pumpId: number
  nozzleId: number
  adjustmentType: AdjustmentType
  fuelType: string
  previousReading: number
  newReading: number
  reason: string
  recordedByUserId: number
  createdAt: string
}

export interface FuelDipEntry {
  id: number
  pumpId: number
  fuelType: string
  litresRemoved: number
  pricePerUnit: number
  monetaryLoss: number
  reason: string
  dipDate: string       // YYYY-MM-DD
  recordedByUserId: number
  createdAt: string
}

export const dipApi = {

  // ── Meter reading adjustments ─────────────────────────────────────────────

  recordAdjustment: (pumpId: number, nozzleId: number, adjustmentType: AdjustmentType, reason: string, newReading?: number) =>
    client.post<NozzleReadingAdjustment>(
      `/pumps/${pumpId}/nozzles/${nozzleId}/reading-adjustments`,
      { adjustmentType, reason, newReading }
    ).then(r => r.data),

  getAdjustments: (pumpId: number, nozzleId: number) =>
    client.get<NozzleReadingAdjustment[]>(`/pumps/${pumpId}/nozzles/${nozzleId}/reading-adjustments`).then(r => r.data),

  // ── Fuel dip entries ──────────────────────────────────────────────────────

  recordDip: (pumpId: number, fuelType: string, litresRemoved: number, reason: string, dipDate?: string) =>
    client.post<FuelDipEntry>(
      `/pumps/${pumpId}/fuel-dips`,
      { fuelType, litresRemoved, reason, dipDate }
    ).then(r => r.data),

  getDips: (pumpId: number) =>
    client.get<FuelDipEntry[]>(`/pumps/${pumpId}/fuel-dips`).then(r => r.data),
}
