package com.ppms.settlement;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class RecordSettlementRequest {
    @NotNull(message = "paymentType is required (UPI, CARD or FLEET_CARD).")
    private SettlementPaymentType paymentType;
    @NotNull(message = "settlementDate is required.")
    @PastOrPresent(message = "settlementDate cannot be in the future.")
    private LocalDate settlementDate;
    @NotNull(message = "amountReceived is required.")
    @DecimalMin(value = "0.00", message = "amountReceived must be a non-negative number.")
    private BigDecimal amountReceived;
    private String notes;
}
