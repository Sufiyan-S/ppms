export interface HandoverDetails {
  incomingOperatorId: number | null
  physicalCashVerified: boolean
  meterReadingsVerified: boolean
  notes: string
}

export const EMPTY_HANDOVER_DETAILS: HandoverDetails = {
  incomingOperatorId: null,
  physicalCashVerified: false,
  meterReadingsVerified: false,
  notes: '',
}
