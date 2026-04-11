package com.ppms.shift;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Request to open a new shift.
 *
 * Start readings are NO LONGER provided by the client. The backend automatically uses
 * each outlet's stored lastReading as the start reading. This ensures consistency —
 * the start reading for a new shift is always the exact value the previous shift ended at.
 *
 * If a reading looks wrong before opening, the Admin/Owner must first correct it in
 * Setup → Nozzle → Adjust Reading (creates a NozzleReadingAdjustment audit record).
 */
@Data
public class OpenShiftRequest {

    @NotNull(message = "Nozzle ID is required")
    private Long nozzleId;

    @NotNull(message = "Operator ID is required")
    private Long operatorId;
}
