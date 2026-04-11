package com.ppms.pump;

import com.ppms.fuel.FuelType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class AddNozzleOutletRequest {

    @NotNull(message = "Fuel type is required")
    private FuelType fuelType;

    /** Optional initial meter reading — defaults to 0 if not provided. */
    @DecimalMin(value = "0", message = "Initial reading must be >= 0")
    private BigDecimal initialReading;
}
