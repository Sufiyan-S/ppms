package com.ppms.expense;

public enum ExpenseApprovalStatus {
    /** Saved but not yet submitted for approval. Only DRAFT expenses can be deleted. */
    DRAFT,
    /** Submitted by OPERATOR/MANAGER and waiting for Owner/Admin review. */
    PENDING_APPROVAL,
    /** Approved — included in P&L and balance sheets. */
    APPROVED,
    /** Rejected — excluded from P&L and balance sheets. */
    REJECTED
}
