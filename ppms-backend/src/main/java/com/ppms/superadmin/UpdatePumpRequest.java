package com.ppms.superadmin;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Request body for PATCH /api/super-admin/pumps/{pumpId}.
 * SuperAdmin can update a pump's display name, address, and enabled status.
 */
@Getter
@Setter
@NoArgsConstructor
public class UpdatePumpRequest {

    @NotBlank(message = "Pump name is required")
    private String pumpName;

    @NotBlank(message = "Pump address is required")
    private String pumpAddress;

    @NotNull(message = "Enabled flag is required")
    private Boolean enabled;
}
