package com.ppms.credit;

/** Whether a client can take a credit sale right now, by the same rules the sale itself is checked against. */
public enum CreditStatus {
    OK,
    OVERDUE,
    OVER_LIMIT,
    INACTIVE
}
