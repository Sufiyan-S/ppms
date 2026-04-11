package com.ppms.bank;

public enum BankLineMatchStatus {
    /** Not yet matched to any system transaction. Default state on import. */
    UNMATCHED,
    /** Linked to a shift, ancillary sale, or credit payment record. */
    MATCHED,
    /** Manually marked as not relevant by Owner/Admin (fees, internal transfers, etc.). */
    IGNORED
}
