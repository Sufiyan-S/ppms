package com.ppms.pump;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class UpdateTankRequest {

    @NotNull(message = "Capacity is required")
    @DecimalMin(value = "0.001", message = "Capacity must be greater than 0")
    private BigDecimal capacity;

    // Optional — if blank the existing identifier is kept
    private String tankIdentifier;
}
