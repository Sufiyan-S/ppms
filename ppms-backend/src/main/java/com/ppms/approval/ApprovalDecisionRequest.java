package com.ppms.approval;

import com.ppms.expense.ExpenseApprovalStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/** The same decision applied to every listed item; a rejection needs a reason. */
public record ApprovalDecisionRequest(
        @NotEmpty(message = "Choose at least one item")
        @Size(max = 200, message = "Decide at most 200 items at a time")
        List<@Valid @NotNull ApprovalItemKey> items,
        @NotNull(message = "Action is required — must be APPROVED or REJECTED")
        ExpenseApprovalStatus action,
        @Size(max = 500, message = "Reason must be at most 500 characters")
        String reason
) {

    public record ApprovalItemKey(
            @NotNull(message = "Item kind is required") ApprovalKind kind,
            @NotNull(message = "Item id is required") Long id
    ) {}

    @AssertTrue(message = "Action must be APPROVED or REJECTED")
    public boolean isActionAllowed() {
        return action == null || action == ExpenseApprovalStatus.APPROVED || action == ExpenseApprovalStatus.REJECTED;
    }

    @AssertTrue(message = "A reason is required to reject")
    public boolean isReasonGivenForRejection() {
        return action != ExpenseApprovalStatus.REJECTED || (reason != null && !reason.isBlank());
    }
}
