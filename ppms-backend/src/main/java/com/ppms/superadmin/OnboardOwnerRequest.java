package com.ppms.superadmin;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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

    @NotNull(message = "Max DU count is required")
    @Min(value = 1, message = "Max DU count must be at least 1")
    @Max(value = 20, message = "Max DU count cannot exceed 20")
    private Integer maxDuCount;
}
