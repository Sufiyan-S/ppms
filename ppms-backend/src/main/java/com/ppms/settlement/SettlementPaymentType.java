package com.ppms.settlement;

/**
 * Payment modes that require settlement tracking.
 *
 * Unlike CASH (received immediately at the counter), these payment types involve
 * a settlement lag — funds are credited to the bank account 1–2 business days later.
 * Owners/Admins record each day's actual bank credit to track the "in-transit wallet".
 *
 * Must match the settlement_payment_type DB enum in V6__payment_settlement_tracking.sql.
 */
public enum SettlementPaymentType {
    UPI,
    CARD,
    FLEET_CARD
}
