package com.ppms.shift;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * Request to open a new shift.
 *
 * One shift = one operator session on one Dispensary Unit (DU), covering
 * 1–N nozzles from that DU. The operator selects the DU first, then picks
 * which nozzles they will operate (can be all or a subset).
 *
 * All nozzle IDs must belong to the same DU, must be ACTIVE, and must not
 * already be locked by another open shift.
 *
 * Start readings are NOT provided by the client — the backend uses each
 * nozzle's stored lastReading as the opening reading automatically.
 */
@Data
public class OpenShiftRequest {

    @NotNull(message = "Dispensary Unit ID is required")
    private Long duId;

    @NotEmpty(message = "At least one nozzle ID is required")
    private List<Long> nozzleIds;

    @NotNull(message = "Operator ID is required")
    private Long operatorId;
}
