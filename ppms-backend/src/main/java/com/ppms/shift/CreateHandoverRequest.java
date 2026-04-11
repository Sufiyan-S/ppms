package com.ppms.shift;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request body for POST /api/pumps/{pumpId}/handovers.
 *
 * outgoingShiftId: the currently open shift the outgoing operator is handing over.
 * incomingOperatorId: the operator who will take over (must not already have an open shift).
 */
public record CreateHandoverRequest(

        @NotNull Long outgoingShiftId,

        @NotNull Long incomingOperatorId,

        boolean physicalCashVerified,

        boolean meterReadingsVerified,

        @Size(max = 1000) String notes
) {}
