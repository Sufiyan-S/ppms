package com.ppms.pump;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

/**
 * Request body for disabling a shift definition group by setting its effectiveTo date.
 * The schedule remains active up to and including disableDate, then expires.
 * After disableDate, operators cannot open new shifts under this schedule.
 */
@Data
public class DisableShiftGroupRequest {

    /**
     * The last date this schedule should be active (inclusive).
     * Must be >= the group's effectiveFrom date.
     * Use today's date to allow today's shifts to finish but block new ones from tomorrow.
     */
    @NotNull(message = "disableDate is required")
    private LocalDate disableDate;
}
