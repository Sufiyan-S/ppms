package com.ppms.superadmin;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Request body for POST /api/super-admin/onboard-owner.
 * Creates an OWNER user and their first pump in a single atomic transaction.
 */
@Data
public class OnboardOwnerRequest {

    @NotBlank(message = "Owner full name is required")
    private String fullName;

    @NotBlank(message = "Phone number is required")
    @Pattern(regexp = "\\d{10}", message = "Phone number must be exactly 10 digits")
    private String phoneNumber;

    @NotBlank(message = "Password is required")
    @Size(min = 6, message = "Password must be at least 6 characters")
    private String password;

    @NotBlank(message = "Pump name is required")
    private String pumpName;

    @NotBlank(message = "Pump address is required")
    private String pumpAddress;

    @NotNull(message = "Max nozzle count is required")
    @Positive(message = "Max nozzle count must be a positive number")
    private Integer maxNozzleCount;
}
