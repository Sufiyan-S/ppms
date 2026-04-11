package com.ppms.supplier;

import com.ppms.credit.PaymentMode;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Request body for POST /api/pumps/{pumpId}/supplier-payments.
 */
public record RecordSupplierPaymentRequest(

        @NotNull Long supplierId,

        /** Optional — links this payment to a specific tanker delivery. */
        Long deliveryId,

        @NotNull @DecimalMin(value = "0.01", message = "Payment amount must be greater than zero")
        BigDecimal amount,

        @NotNull LocalDate paymentDate,

        @NotNull PaymentMode paymentMode,

        @Size(max = 100) String referenceNo,

        @Size(max = 1000) String notes
) {}
