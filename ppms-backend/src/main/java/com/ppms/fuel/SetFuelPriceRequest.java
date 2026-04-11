package com.ppms.fuel;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class SetFuelPriceRequest {

    @NotNull(message = "Pump ID is required")
    private Long pumpId;

    @NotNull(message = "Fuel type is required")
    private FuelType fuelType;

    @NotNull(message = "Price is required")
    @DecimalMin(value = "0.01", message = "Price must be greater than zero")
    private java.math.BigDecimal pricePerUnit;

    /**
     * Must be explicitly set to true when the new price deviates >15% from the last price
     * (spec Business Rule 37). The frontend shows a warning dialog and re-submits with confirmed=true.
     * Defaults to false.
     */
    private boolean confirmed = false;
}
