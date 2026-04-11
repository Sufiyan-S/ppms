package com.ppms.pump;

public enum TankStatus {
    ACTIVE,
    /** Temporarily disabled — stock frozen, no deliveries, no DIP checks allowed. */
    INACTIVE,
    DECOMMISSIONED
}
