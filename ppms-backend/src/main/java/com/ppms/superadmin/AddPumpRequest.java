package com.ppms.superadmin;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

/**
 * Request body for POST /api/super-admin/owners/{ownerId}/pumps.
 * Adds a new pump location to an existing owner.
 */
@Data
public class AddPumpRequest {

    @NotBlank(message = "Pump name is required")
    private String pumpName;

    @NotBlank(message = "Pump address is required")
    private String pumpAddress;

    @NotNull(message = "Max nozzle count is required")
    @Positive(message = "Max nozzle count must be a positive number")
    private Integer maxNozzleCount;
}
