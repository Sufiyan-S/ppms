package com.ppms.invoice;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CancelCreditInvoiceRequest(
        @NotBlank(message = "A reason is required to cancel an invoice")
        @Size(max = 500, message = "Reason must be at most 500 characters")
        String reason
) {}
