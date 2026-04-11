package com.ppms.expense;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ApproveExpenseRequest {

    @NotNull(message = "Action is required — must be APPROVED or REJECTED")
    private ExpenseApprovalStatus action;

    /** Optional notes explaining the approval or rejection decision. */
    private String notes;
}
