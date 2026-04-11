package com.ppms.credit;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class RecordPaymentRequest {

    @NotNull(message = "Amount is required")
    @DecimalMin(value = "0.01", message = "Payment amount must be greater than zero")
    private BigDecimal amount;

    @NotNull(message = "Payment mode is required")
    private PaymentMode paymentMode;

    @NotNull(message = "Payment date is required")
    private LocalDate paidAt;

    /** Optional reference number, e.g. cheque number, NEFT/IMPS ref, UPI transaction ID. */
    private String referenceNo;

    // Optional note, e.g. "Partial payment for March outstanding"
    private String notes;
}
