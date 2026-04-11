package com.ppms.planning;

public enum ShiftPlanEntryStatus {
    /** Assigned in the plan, actual shift not yet opened. */
    PLANNED,
    /** Operator showed up and the shift was opened as planned. */
    CONFIRMED,
    /** Shift was opened with a different operator — this operator did not show up. */
    ABSENT
}
