import client from './client'

export type AuditAction =
  // User management
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DEACTIVATED'
  | 'USER_STATUS_CHANGED'
  | 'PASSWORD_RESET'
  | 'USER_PUMP_CHANGED'
  // Authentication
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'TOKEN_REVOKED'
  // Fuel pricing
  | 'FUEL_PRICE_UPDATED'
  // Shift lifecycle
  | 'SHIFT_OPENED'
  | 'SHIFT_CLOSED'
  | 'SHIFT_BACKFILLED'
  | 'DISCREPANCY_RESOLVED'
  | 'DISCREPANCY_INVESTIGATION_STARTED'
  // Credit management
  | 'CREDIT_ENTRY_VOIDED'
  | 'CREDIT_LIMIT_CHANGED'
  | 'CREDIT_PAYMENT_RECEIVED'
  | 'INTEREST_APPLIED'
  | 'INTEREST_CHARGE_WAIVED'
  | 'INTEREST_SETTINGS_CHANGED'
  | 'CREDIT_CLIENT_CREATED'
  | 'CREDIT_CLIENT_DELETED'
  | 'CREDIT_ENTRY_REASSIGNED'
  | 'CREDIT_INVOICE_ISSUED'
  | 'CREDIT_INVOICE_CANCELLED'
  | 'CREDIT_EXTENSION_GRANTED'
  | 'CREDIT_EXTENSION_REVOKED'
  | 'INTEREST_RECALCULATED'
  // Inventory
  | 'DELIVERY_RECORDED'
  | 'DELIVERY_UPDATED'
  | 'DELIVERY_DELETED'
  | 'LOT_COST_CORRECTED'
  | 'DIP_CHECK_RECORDED'
  // Documents
  | 'DOCUMENT_ADDED'
  // Expenses
  | 'EXPENSE_RECORDED'
  | 'EXPENSE_APPROVED'
  | 'EXPENSE_REJECTED'
  // Payroll
  | 'PAYROLL_APPROVED'
  | 'PAYROLL_DELETED'
  // Pump management
  | 'PUMP_CREATED'
  | 'PUMP_DELETED'
  | 'PUMP_UPDATED'
  | 'PUMP_SUSPENDED'
  | 'PUMP_ENABLED'
  | 'OWNER_ONBOARDED'
  | 'NOZZLE_ADDED'
  | 'CALIBRATION_LOGGED'
  | 'TANK_ADDED'
  // Ancillary products
  | 'ANCILLARY_SALE_RECORDED'
  | 'ANCILLARY_PRICE_OVERRIDDEN'
  | 'ANCILLARY_SALE_BACKFILLED'
  | 'ANCILLARY_DELIVERY_RECORDED'
  | 'ANCILLARY_DELIVERY_BACKFILLED'
  // Operations
  | 'HANDOVER_COMPLETED'
  | 'PUMP_CLOSURE_ADDED'
  | 'BANK_STATEMENT_IMPORTED'
  | 'SUPPLIER_PAYMENT_RECORDED'
  | 'PUMP_CONFIG_UPDATED'
  // Payment settlements
  | 'SETTLEMENT_RECORDED'
  | 'SETTLEMENT_VOIDED'
  | 'SETTLEMENT_CONFIG_UPDATED'

export interface AuditLog {
  id: number
  pumpId: number
  action: AuditAction
  entityType: string
  entityId: string | null
  description: string
  actorId: number | null
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
  action?: AuditAction
  actorId?: number
  /** Leaves out "Signed in" events. */
  hideSignIns?: boolean
}

export interface AuditActor {
  actorId: number
  actorName: string
}

export const auditApi = {
  getAuditLogs: ({ pumpId, page, size, from, to, action, actorId, hideSignIns }: AuditLogsParams): Promise<AuditPage> =>
    client.get(`/pumps/${pumpId}/audit-logs`, {
      params: {
        page, size, sort: 'createdAt,desc',
        ...(from && { from }), ...(to && { to }), ...(action && { action }), ...(actorId && { actorId }),
        ...(hideSignIns && { hideSignIns: true }),
      },
    }).then(r => r.data),

  /** Everyone with an audit event at the pump, for the "by user" filter. */
  getActors: (pumpId: number): Promise<AuditActor[]> =>
    client.get(`/pumps/${pumpId}/audit-logs/actors`).then(r => r.data),
}
