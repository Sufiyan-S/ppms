package com.ppms.ancillary;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class SetProductPriceRequest {

    @NotNull(message = "Price per unit is required")
    @DecimalMin(value = "0.01", message = "Price must be at least 0.01")
    private BigDecimal pricePerUnit;
}
