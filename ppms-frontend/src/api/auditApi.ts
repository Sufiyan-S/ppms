import client from './client'

export type AuditAction =
  // User management
  | 'USER_CREATED'
  | 'USER_DEACTIVATED'
  | 'USER_STATUS_CHANGED'
  // Authentication
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'TOKEN_REVOKED'
  // Fuel pricing
  | 'FUEL_PRICE_UPDATED'
  // Shift lifecycle
  | 'SHIFT_OPENED'
  | 'SHIFT_CLOSED'
  | 'DISCREPANCY_RESOLVED'
  // Credit management
  | 'CREDIT_ENTRY_VOIDED'
  | 'CREDIT_LIMIT_CHANGED'
  | 'CREDIT_PAYMENT_RECEIVED'
  | 'INTEREST_APPLIED'
  | 'CREDIT_CLIENT_CREATED'
  | 'CREDIT_CLIENT_DELETED'
  | 'CREDIT_ENTRY_REASSIGNED'
  // Inventory
  | 'DELIVERY_RECORDED'
  | 'DIP_CHECK_RECORDED'
  // Documents
  | 'DOCUMENT_ADDED'
  // Expenses
  | 'EXPENSE_RECORDED'
  // Payroll
  | 'PAYROLL_APPROVED'
  // Pump management
  | 'PUMP_CREATED'
  | 'PUMP_DELETED'
  | 'NOZZLE_ADDED'
  | 'TANK_ADDED'
  // Ancillary products
  | 'ANCILLARY_SALE_RECORDED'
  | 'ANCILLARY_DELIVERY_RECORDED'
  // Operations
  | 'HANDOVER_COMPLETED'
  | 'PUMP_CLOSURE_ADDED'
  | 'BANK_STATEMENT_IMPORTED'
  | 'SUPPLIER_PAYMENT_RECORDED'
  | 'PUMP_CONFIG_UPDATED'

export interface AuditLog {
  id: number
  pumpId: number
  action: AuditAction
  entityType: string
  entityId: string | null
  description: string
  actorId: number
  actorName: string
  createdAt: string
}

// Spring Boot 3.3+ wraps pagination metadata under a nested "page" object
export interface AuditPage {
  content: AuditLog[]
  page: {
    size: number
    number: number       // zero-based current page
    totalElements: number
    totalPages: number
  }
}

export interface AuditLogsParams {
  pumpId: number
  page: number
  size: number
  from?: string        // yyyy-MM-dd
  to?: string          // yyyy-MM-dd
}

export const auditApi = {
  getAuditLogs: ({ pumpId, page, size, from, to }: AuditLogsParams): Promise<AuditPage> =>
    client.get(`/pumps/${pumpId}/audit-logs`, {
      params: { page, size, sort: 'createdAt,desc', ...(from && { from }), ...(to && { to }) },
    }).then(r => r.data),
}
