package com.ppms.credit;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request body for PATCH /api/pumps/{pumpId}/credit-clients/{clientId}
 *
 * All fields are optional — only non-null values are applied.
 * Name uniqueness is re-validated if the name is being changed.
 */
public record UpdateCreditClientRequest(

        @Size(min = 1, max = 100, message = "Name must be between 1 and 100 characters")
        String name,

        @Pattern(regexp = "^\\d{10}$", message = "Phone must be exactly 10 digits")
        String phone,

        String notes
) {}
