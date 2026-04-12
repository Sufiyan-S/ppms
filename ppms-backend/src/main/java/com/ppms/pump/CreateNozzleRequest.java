package com.ppms.pump;

import com.ppms.fuel.FuelType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Data
public class CreateNozzleRequest {

    @NotNull(message = "Nozzle number is required")
    @Min(value = 1, message = "Nozzle number must be 1–20")
    @Max(value = 20, message = "Nozzle number must be 1–20")
    private Integer nozzleNumber;

    /**
     * Which fuel types this nozzle dispenses.
     * Rules enforced at service layer:
     *  - 1–4 non-CNG fuel types (PETROL, SPEED_PETROL, DIESEL, SPEED_DIESEL)
     *  - OR exactly 1 CNG — never mixed with the others
     */
    @NotEmpty(message = "At least one fuel type is required")
    private List<FuelType> fuelTypes;

    /**
     * Optional initial meter reading per fuel type outlet.
     * Use when the physical meter already has a non-zero value at setup.
     * Defaults to 0 for any fuel type not present in this map.
     */
    private Map<FuelType, BigDecimal> startReadings;

    /** Optional: defaults to 999999.999. */
    private BigDecimal maxMeterValue;
}
