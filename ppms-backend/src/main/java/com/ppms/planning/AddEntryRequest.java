package com.ppms.planning;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public record AddEntryRequest(
        @NotNull LocalDate shiftDate,
        @NotNull Long shiftDefinitionId,
        @NotNull Long operatorUserId,
        String note
) {}
