package com.ppms.shift;

import jakarta.validation.constraints.NotBlank;

public record VoidCreditEntryRequest(
        @NotBlank(message = "Void reason is required")
        String voidReason
) {}
