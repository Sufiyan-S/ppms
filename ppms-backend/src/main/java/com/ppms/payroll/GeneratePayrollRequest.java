package com.ppms.payroll;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

@Data
public class GeneratePayrollRequest {

    @NotNull(message = "userId is required")
    private Long userId;

    @NotNull(message = "periodFrom is required")
    private LocalDate periodFrom;

    @NotNull(message = "periodTo is required")
    private LocalDate periodTo;

    private String notes;

    /**
     * Shift IDs with pending discrepancies that the owner chose to resolve as SALARY_DEDUCTION
     * during this payroll run. Shifts not listed here are skipped (remain PENDING) and can be
     * addressed in a future payroll.
     */
    private List<Long> deductFromSalaryShiftIds;
}
