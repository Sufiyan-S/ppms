package com.ppms.planning;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public record GeneratePlanRequest(
        @NotNull LocalDate weekStart,
        @Min(1) @Max(20) int operatorsPerDayShift,
        @Min(1) @Max(20) int operatorsPerNightShift
) {}
