package com.ppms.shift;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request body for POST /api/pumps/{pumpId}/handovers.
 *
 * outgoingShiftId: the currently open shift the outgoing operator is handing over.
 * incomingOperatorId: the operator who will take over (must not already have an open shift).
 * closing: the outgoing operator's end readings, payments and credit sales, exactly as for a shift close
 * (required; checked in ShiftHandoverService after the operators, so who-related refusals are reported first).
 */
public record CreateHandoverRequest(

        @NotNull Long outgoingShiftId,

        @NotNull Long incomingOperatorId,

        boolean physicalCashVerified,

        boolean meterReadingsVerified,

        @Size(max = 1000) String notes,

        @Valid CloseShiftRequest closing
) {}
