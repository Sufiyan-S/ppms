package com.ppms.credit;

/**
 * How often a credit customer is billed and when overdue status is assessed (spec Section 3.6).
 * WEEKLY  — billing period ends each Monday.
 * MONTHLY — billing period ends on the 1st of each month.
 */
public enum BillingCycle {
    WEEKLY,
    MONTHLY
}
