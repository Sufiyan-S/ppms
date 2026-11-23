import type { AuditAction } from '../../api/auditApi'
import type { StatusTone } from '../../components/StatusBadge'
import { codeLabel } from '../../constants/labels'
import { translateKey } from '../../i18n'

/** The action in the user's language; an action the frontend does not know yet falls back to its code in words. */
export function auditActionLabel(action: string): string {
  return translateKey(`audit:actions.${action}`, { defaultValue: codeLabel(action) })
}

export const AUDIT_ACTION_TONES: Record<AuditAction, StatusTone> = {
  // User management
  USER_CREATED:                       'info',
  USER_UPDATED:                       'neutral',
  USER_DEACTIVATED:                   'bad',
  USER_STATUS_CHANGED:                'warn',
  PASSWORD_RESET:                     'warn',
  USER_PUMP_CHANGED:                  'info',
  // Authentication
  LOGIN:                              'neutral',
  LOGIN_FAILED:                       'bad',
  TOKEN_REVOKED:                      'neutral',
  // Fuel pricing
  FUEL_PRICE_UPDATED:                 'neutral',
  // Shift lifecycle
  SHIFT_OPENED:                       'info',
  SHIFT_CLOSED:                       'ok',
  SHIFT_BACKFILLED:                   'info',
  DISCREPANCY_RESOLVED:               'warn',
  DISCREPANCY_INVESTIGATION_STARTED:  'warn',
  // Credit management
  CREDIT_ENTRY_VOIDED:                'bad',
  CREDIT_LIMIT_CHANGED:               'warn',
  CREDIT_PAYMENT_RECEIVED:            'ok',
  INTEREST_APPLIED:                   'warn',
  INTEREST_CHARGE_WAIVED:             'warn',
  INTEREST_SETTINGS_CHANGED:          'neutral',
  CREDIT_CLIENT_CREATED:              'info',
  CREDIT_CLIENT_DELETED:              'bad',
  CREDIT_ENTRY_REASSIGNED:            'warn',
  CREDIT_INVOICE_ISSUED:              'ok',
  CREDIT_INVOICE_CANCELLED:           'bad',
  CREDIT_EXTENSION_GRANTED:           'ok',
  CREDIT_EXTENSION_REVOKED:           'bad',
  INTEREST_RECALCULATED:              'warn',
  // Inventory
  DELIVERY_RECORDED:                  'info',
  DELIVERY_UPDATED:                   'warn',
  DELIVERY_DELETED:                   'bad',
  LOT_COST_CORRECTED:                 'warn',
  DIP_CHECK_RECORDED:                 'info',
  // Documents
  DOCUMENT_ADDED:                     'neutral',
  // Expenses
  EXPENSE_RECORDED:                   'neutral',
  EXPENSE_APPROVED:                   'ok',
  EXPENSE_REJECTED:                   'bad',
  // Payroll
  PAYROLL_APPROVED:                   'ok',
  PAYROLL_DELETED:                    'bad',
  // Pump management
  PUMP_CREATED:                       'info',
  PUMP_DELETED:                       'bad',
  PUMP_UPDATED:                       'neutral',
  PUMP_SUSPENDED:                     'bad',
  PUMP_ENABLED:                       'ok',
  OWNER_ONBOARDED:                    'info',
  NOZZLE_ADDED:                       'info',
  CALIBRATION_LOGGED:                 'info',
  TANK_ADDED:                         'info',
  // Ancillary products
  ANCILLARY_SALE_RECORDED:            'ok',
  ANCILLARY_PRICE_OVERRIDDEN:         'warn',
  ANCILLARY_SALE_BACKFILLED:          'ok',
  ANCILLARY_DELIVERY_RECORDED:        'info',
  ANCILLARY_DELIVERY_BACKFILLED:      'info',
  // Operations
  HANDOVER_COMPLETED:                 'ok',
  PUMP_CLOSURE_ADDED:                 'neutral',
  BANK_STATEMENT_IMPORTED:            'info',
  SUPPLIER_PAYMENT_RECORDED:          'ok',
  PUMP_CONFIG_UPDATED:                'neutral',
  // Payment settlements
  SETTLEMENT_RECORDED:                'ok',
  SETTLEMENT_VOIDED:                  'bad',
  SETTLEMENT_CONFIG_UPDATED:          'neutral',
}
