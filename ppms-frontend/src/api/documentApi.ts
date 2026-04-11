import client from './client'

export type DocumentStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED'

export interface PumpDocument {
  id: number
  pumpId: number
  name: string
  docType: string
  status: DocumentStatus
  expiryDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertDocumentRequest {
  name: string
  docType: string
  expiryDate: string | null
  notes: string | null
}

export const documentApi = {
  getDocuments: (pumpId: number): Promise<PumpDocument[]> =>
    client.get(`/pumps/${pumpId}/documents`).then(r => r.data),

  createDocument: (pumpId: number, data: UpsertDocumentRequest): Promise<PumpDocument> =>
    client.post(`/pumps/${pumpId}/documents`, data).then(r => r.data),

  updateDocument: (pumpId: number, documentId: number, data: UpsertDocumentRequest): Promise<PumpDocument> =>
    client.put(`/pumps/${pumpId}/documents/${documentId}`, data).then(r => r.data),

  deleteDocument: (pumpId: number, documentId: number): Promise<void> =>
    client.delete(`/pumps/${pumpId}/documents/${documentId}`).then(r => r.data),
}
