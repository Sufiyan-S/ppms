package com.ppms.cash;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class RecordCashEventRequest {

    @NotNull(message = "eventType is required")
    private CashEventType eventType;

    @NotNull(message = "amount is required")
    @DecimalMin(value = "0.00", message = "amount cannot be negative")
    private BigDecimal amount;

    @NotBlank(message = "description is required")
    private String description;

    @NotNull(message = "eventDate is required")
    private LocalDate eventDate;
}
