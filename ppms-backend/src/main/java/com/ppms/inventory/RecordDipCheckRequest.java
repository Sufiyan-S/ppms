package com.ppms.inventory;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class RecordDipCheckRequest {

    @NotNull(message = "Tank is required")
    private Long tankId;

    @NotNull(message = "Measured quantity is required")
    @DecimalMin(value = "0", message = "Measured quantity cannot be negative")
    private BigDecimal measuredQuantity;

    @NotNull(message = "Check date is required")
    private LocalDate checkedAt;

    // The operator who physically took the dipstick reading
    private Long checkedByUserId;

    // Optional note from the operator or manager
    private String notes;
}
