package com.ppms.pump;

import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Request body for POST /api/pumps/{pumpId}/closures.
 * Records a pump closure for a specific date (holiday, maintenance, dry-day, etc.).
 *
 * closureDate may be today or any future date.
 * Attempting to close a date in the past is rejected — past operational history
 * should not be retroactively altered without an explicit audit trail.
 */
public record CreatePumpClosureRequest(

        @NotNull @FutureOrPresent LocalDate closureDate,

        @NotBlank @Size(max = 255) String reason
) {}
