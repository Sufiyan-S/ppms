package com.ppms.planning;

import jakarta.validation.constraints.NotNull;

public record UpdateEntryRequest(
        /** Replace with this operator (must be active staff on this pump). */
        @NotNull Long operatorUserId,
        String note
) {}
