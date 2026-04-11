package com.ppms.notification;

public enum NotificationType {
    LOW_STOCK,
    PRICE_STALE,
    DOCUMENT_EXPIRING,
    CALIBRATION_DUE,
    SHIFT_OVERDUE,
    /** Fired when a shift closes with ₹0 in sales but was open for more than 30 minutes. */
    ZERO_SALE_SHIFT,
    /** Fired when a fuel price is updated while at least one shift is currently open. */
    PRICE_CHANGE_OPEN_SHIFT,
    /** Fired when an ancillary product's stock falls at or below its configured low_stock_threshold. */
    ANCILLARY_LOW_STOCK,
    /**
     * Fired when the OverdueShiftJob force-closes a shift that was never submitted by the operator.
     * Signals to management that meter readings are missing and a manual reconciliation is required.
     */
    AUTO_CLOSED_SHIFT
}
