package com.ppms.shift;

import jakarta.validation.constraints.NotNull;

/**
 * Request body for PATCH /api/shifts/{id}/discrepancy-resolution.
 * Used by Manager or Admin to set the resolution action after a discrepant shift is closed.
 * WAIVED (spec Business Rule 19) and PENDING_INVESTIGATION require a non-blank resolutionNote.
 */
public record ResolveDiscrepancyRequest(

        @NotNull(message = "Resolution action is required")
        DiscrepancyResolution resolutionAction,

        String resolutionNote
) {}
