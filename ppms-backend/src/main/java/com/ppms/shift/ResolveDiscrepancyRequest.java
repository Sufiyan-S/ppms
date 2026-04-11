package com.ppms.shift;

import jakarta.validation.constraints.NotNull;

/**
 * Request body for PATCH /api/shifts/{id}/discrepancy-resolution.
 * Used by Manager or Admin to set the resolution action after a discrepant shift is closed.
 * WAIVED requires a non-blank resolutionNote (spec Business Rule 19).
 */
public record ResolveDiscrepancyRequest(

        @NotNull(message = "Resolution action is required")
        DiscrepancyResolution resolutionAction,

        String resolutionNote
) {}
