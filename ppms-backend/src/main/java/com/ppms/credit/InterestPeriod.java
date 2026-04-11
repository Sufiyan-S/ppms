package com.ppms.credit;

/**
 * How frequently interest is calculated and staged for a credit customer (spec Section 3.6).
 * WEEKLY  — interest job fires every Monday at 1:00 AM IST.
 * MONTHLY — interest job fires on the 1st of each month at 1:00 AM IST.
 */
public enum InterestPeriod {
    WEEKLY,
    MONTHLY
}
