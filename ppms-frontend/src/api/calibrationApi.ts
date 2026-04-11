import client from './client'
import type { PagedResponse } from '../types/paged'

export interface NozzleCalibrationLog {
  id: number
  pumpId: number
  nozzleId: number
  calibrationDate: string
  nextCalibrationDue: string | null
  calibratedBy: string | null
  certificateReference: string | null
  notes: string | null
  loggedByUserId: number
  loggedByName: string
  createdAt: string
}

export interface LogCalibrationRequest {
  calibrationDate: string
  nextCalibrationDue: string | null
  calibratedBy: string | null
  certificateReference: string | null
  notes: string | null
}

export const calibrationApi = {
  getCalibrations: (pumpId: number, nozzleId: number, page = 0, size = 10): Promise<PagedResponse<NozzleCalibrationLog>> =>
    client.get(`/pumps/${pumpId}/nozzles/${nozzleId}/calibrations`, { params: { page, size } }).then(r => r.data),

  getPumpCalibrations: (pumpId: number, page = 0, size = 10): Promise<PagedResponse<NozzleCalibrationLog>> =>
    client.get(`/pumps/${pumpId}/calibrations`, { params: { page, size } }).then(r => r.data),

  recordCalibration: (pumpId: number, nozzleId: number, data: LogCalibrationRequest): Promise<NozzleCalibrationLog> =>
    client.post(`/pumps/${pumpId}/nozzles/${nozzleId}/calibrations`, data).then(r => r.data),
}
