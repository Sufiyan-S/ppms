import client from './client'

export interface Tanker {
  id: number
  pumpId: number
  name: string
  capacityLitres: number
  tankerType: 'OWN' | 'COMPANY'
  defaultTanker: boolean
  active: boolean
  createdAt: string
}

export interface CreateTankerRequest {
  name: string
  capacityLitres: number
  tankerType: 'OWN' | 'COMPANY'
  defaultTanker: boolean
}

export const tankerApi = {
  getTankers: (pumpId: number) =>
    client.get<Tanker[]>(`/pumps/${pumpId}/tankers`).then(r => r.data),

  createTanker: (pumpId: number, req: CreateTankerRequest) =>
    client.post<Tanker>(`/pumps/${pumpId}/tankers`, req).then(r => r.data),

  updateTanker: (pumpId: number, tankerId: number, req: CreateTankerRequest) =>
    client.patch<Tanker>(`/pumps/${pumpId}/tankers/${tankerId}`, req).then(r => r.data),

  deactivateTanker: (pumpId: number, tankerId: number) =>
    client.delete(`/pumps/${pumpId}/tankers/${tankerId}`),

  setDefault: (pumpId: number, tankerId: number) =>
    client.patch<Tanker>(`/pumps/${pumpId}/tankers/${tankerId}/set-default`).then(r => r.data),
}
