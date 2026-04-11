package com.ppms.expense;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class CreateExpenseRequest {

    @NotNull(message = "category is required")
    private ExpenseCategory category;

    @NotNull(message = "amount is required")
    @DecimalMin(value = "0.01", message = "amount must be greater than zero")
    private BigDecimal amount;

    @NotBlank(message = "description is required")
    private String description;

    @NotNull(message = "expenseDate is required")
    private LocalDate expenseDate;

    /**
     * When true, saves the expense as DRAFT without triggering the approval workflow.
     * Submit later via PATCH .../submit to start the approval flow.
     * Defaults to false — omitting it behaves exactly as before (immediate submission).
     */
    private boolean saveDraft = false;
}
