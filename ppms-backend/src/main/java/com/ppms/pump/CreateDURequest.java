package com.ppms.pump;

import com.ppms.fuel.FuelType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * Request to create a new Dispensary Unit (physical dispensing machine) at a pump.
 *
 * The DU name is user-provided (e.g. "Machine 1"). du_number is auto-assigned by the backend.
 * Each nozzle on the DU carries exactly one fuel type.
 * CNG nozzles cannot be mixed with non-CNG nozzles on the same DU.
 */
@Data
public class CreateDURequest {

    @NotBlank(message = "DU name is required (e.g. 'Machine 1')")
    @Size(max = 100, message = "DU name must be at most 100 characters")
    private String name;

    @NotEmpty(message = "At least one nozzle is required")
    @Valid
    private List<NozzleInput> nozzles;

    @Data
    public static class NozzleInput {

        @NotNull(message = "Nozzle number is required")
        @Min(value = 1, message = "Nozzle number must be 1–9")
        @Max(value = 9, message = "Nozzle number must be 1–9")
        private Integer nozzleNumber;

        @NotNull(message = "Fuel type is required")
        private FuelType fuelType;

        /** Optional initial reading. Defaults to 0 if not provided. */
        @DecimalMin(value = "0", message = "Initial reading cannot be negative")
        private BigDecimal initialReading;
    }
}
