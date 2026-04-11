package com.ppms.credit;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Request body for POST /api/pumps/{pumpId}/credit-clients/{clientId}/extensions.
 * Admin or Owner only (spec Section 3.6, Business Rule 51).
 */
public record CreateCreditExtensionRequest(

        @NotNull(message = "Extension type is required")
        CreditExtensionType extensionType,

        /** Required for AMOUNT_EXTENSION only — additional credit headroom in ₹. */
        BigDecimal extensionAmount,

        /** Mandatory — open-ended extensions are not permitted (Business Rule 58). */
        @NotNull(message = "Expiry date is required")
        @Future(message = "Expiry date must be in the future")
        LocalDate expiryDate,

        /** Mandatory written justification for audit compliance. */
        @NotBlank(message = "A reason for granting the extension is required")
        String reason
) {}
