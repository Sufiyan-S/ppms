package com.ppms.inventory;

public enum DipCheckStatus {
    /** Variance is within the tank's configured dip_tolerance — no action needed. */
    WITHIN_TOLERANCE,
    /** Variance exceeds tolerance — awaiting Owner/Admin acknowledgement. */
    PENDING_REVIEW,
    /** Owner/Admin has reviewed and acknowledged the above-tolerance variance. */
    REVIEWED
}
