package com.ppms.payroll;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class GeneratePayrollRequest {

    @NotNull(message = "userId is required")
    private Long userId;

    @NotNull(message = "periodFrom is required")
    private LocalDate periodFrom;

    @NotNull(message = "periodTo is required")
    private LocalDate periodTo;

    private String notes;
}
