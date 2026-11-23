package com.ppms.audit;

/**
 * All audit actions tracked by the system.
 * Values must exactly match the audit_action ENUM in the DB (V1__complete_schema.sql).
 * Adding a new value here requires a corresponding DB migration to add it to the ENUM type.
 */
public enum AuditAction {
    // ── User management ──────────────────────────────────────────────────────
    USER_CREATED,
    USER_UPDATED,
    USER_DEACTIVATED,
    USER_STATUS_CHANGED,
    PASSWORD_RESET,
    USER_PUMP_CHANGED,

    // ── Authentication ────────────────────────────────────────────────────────
    LOGIN,
    LOGIN_FAILED,
    TOKEN_REVOKED,

    // ── Fuel pricing ──────────────────────────────────────────────────────────
    FUEL_PRICE_UPDATED,

    // ── Shift lifecycle ───────────────────────────────────────────────────────
    SHIFT_OPENED,
    SHIFT_CLOSED,
    SHIFT_BACKFILLED,
    DISCREPANCY_RESOLVED,
    DISCREPANCY_INVESTIGATION_STARTED,

    // ── Credit management ─────────────────────────────────────────────────────
    CREDIT_ENTRY_VOIDED,
    CREDIT_LIMIT_CHANGED,
    CREDIT_PAYMENT_RECEIVED,
    INTEREST_APPLIED,
    INTEREST_CHARGE_WAIVED,
    INTEREST_SETTINGS_CHANGED,
    CREDIT_CLIENT_CREATED,
    CREDIT_CLIENT_DELETED,
    CREDIT_ENTRY_REASSIGNED,
    CREDIT_INVOICE_ISSUED,
    CREDIT_INVOICE_CANCELLED,
    CREDIT_EXTENSION_GRANTED,
    CREDIT_EXTENSION_REVOKED,
    INTEREST_RECALCULATED,

    // ── Inventory ─────────────────────────────────────────────────────────────
    DELIVERY_RECORDED,
    DELIVERY_UPDATED,
    LOT_COST_CORRECTED,
    DELIVERY_DELETED,
    DIP_CHECK_RECORDED,

    // ── Documents ─────────────────────────────────────────────────────────────
    DOCUMENT_ADDED,

    // ── Expenses ──────────────────────────────────────────────────────────────
    EXPENSE_RECORDED,
    EXPENSE_APPROVED,
    EXPENSE_REJECTED,

    // ── Payroll ───────────────────────────────────────────────────────────────
    PAYROLL_APPROVED,
    PAYROLL_DELETED,

    // ── Pump management ───────────────────────────────────────────────────────
    PUMP_CREATED,
    PUMP_DELETED,
    PUMP_UPDATED,
    PUMP_SUSPENDED,
    PUMP_ENABLED,
    OWNER_ONBOARDED,
    NOZZLE_ADDED,
    CALIBRATION_LOGGED,
    TANK_ADDED,

    // ── Ancillary products ────────────────────────────────────────────────────
    ANCILLARY_SALE_RECORDED,
    ANCILLARY_PRICE_OVERRIDDEN,
    ANCILLARY_SALE_BACKFILLED,
    ANCILLARY_DELIVERY_RECORDED,
    ANCILLARY_DELIVERY_BACKFILLED,

    // ── Operations ────────────────────────────────────────────────────────────
    HANDOVER_COMPLETED,
    PUMP_CLOSURE_ADDED,
    BANK_STATEMENT_IMPORTED,
    SUPPLIER_PAYMENT_RECORDED,
    PUMP_CONFIG_UPDATED,

    // ── Payment settlements ───────────────────────────────────────────────────
    SETTLEMENT_RECORDED,
    SETTLEMENT_VOIDED,
    SETTLEMENT_CONFIG_UPDATED
}
