package com.ppms.invoice;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public record GenerateAllCreditInvoicesRequest(
        @NotNull(message = "periodFrom is required") LocalDate periodFrom,
        @NotNull(message = "periodTo is required") LocalDate periodTo
) {}
