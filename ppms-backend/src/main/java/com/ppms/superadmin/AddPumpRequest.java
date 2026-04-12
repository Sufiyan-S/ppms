package com.ppms.superadmin;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
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

    @NotNull(message = "Max DU count is required")
    @Min(value = 1, message = "Max DU count must be at least 1")
    @Max(value = 20, message = "Max DU count cannot exceed 20")
    private Integer maxDuCount;
}
