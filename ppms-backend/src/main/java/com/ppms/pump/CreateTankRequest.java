package com.ppms.pump;

import com.ppms.fuel.FuelType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class CreateTankRequest {

    @NotBlank(message = "Tank identifier is required")
    private String tankIdentifier;

    @NotNull(message = "Fuel type is required")
    private FuelType fuelType;

    @NotNull(message = "Capacity is required")
    @DecimalMin(value = "1", message = "Capacity must be at least 1 litre")
    private BigDecimal capacity;

    /** DIP tolerance in litres — defaults to 20 if not provided. */
    private BigDecimal dipTolerance;
}
