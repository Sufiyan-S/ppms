package com.ppms.pump;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * Request body for creating a batch of shift definitions for a pump,
 * all sharing the same effectiveFrom date.
 *
 * The list must satisfy:
 *   - 1–4 entries
 *   - Exactly one entry with isNightShift=true
 *   - The night shift must overlap 00:00–06:00
 *   - No overlapping time windows
 *   - Total duration across all shifts must not exceed 24 hours
 */
@Data
public class CreateShiftDefinitionRequest {

    @NotBlank(message = "Shift name is required")
    @Size(max = 100, message = "Shift name must be at most 100 characters")
    private String name;

    @NotNull(message = "Start time is required")
    private LocalTime startTime;

    @NotNull(message = "End time is required")
    private LocalTime endTime;

    /** True if this is the designated night shift. Exactly one per definition group must be true. */
    @JsonProperty("isNightShift")
    private boolean isNightShift;

    /** Display order within the day (1-based). Must be unique within the same effectiveFrom group. */
    @NotNull(message = "Sort order is required")
    private Integer sortOrder;

    /**
     * The date from which this shift definition becomes active.
     * All shifts in the same submission share this date.
     * Defaults to today if not provided.
     */
    private LocalDate effectiveFrom;

    /**
     * The last date this shift definition is active (inclusive).
     * Null means no end date (open-ended). All shifts in the same submission must share this value.
     * When provided, no other group for the same pump may overlap the [effectiveFrom, effectiveTo] range.
     */
    private LocalDate effectiveTo;
}
