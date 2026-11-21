package com.ppms.shift;

public enum ShiftStatus {
    OPEN,
    OPEN_OVERDUE,
    AUTO_CLOSED_OVERDUE,
    CLOSED_BALANCED,
    CLOSED_DISCREPANCY_PENDING,
    CLOSED_DISCREPANCY_PENDING_APPROVAL,
    CLOSED_DISCREPANCY_RESOLVED;

    /** AUTO_CLOSED_OVERDUE still counts as open: the operator has not entered closing readings yet. */
    public boolean isOpen() {
        return this == OPEN || this == OPEN_OVERDUE || this == AUTO_CLOSED_OVERDUE;
    }
}
