package com.ppms.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;

@Data
public class CreateUserRequest {

    @NotBlank(message = "Full name is required")
    private String fullName;

    @NotBlank(message = "Phone number is required")
    @Pattern(regexp = "\\d{10}", message = "Phone number must be exactly 10 digits")
    private String phoneNumber;

    @NotBlank(message = "Password is required")
    @Size(min = 6, message = "Password must be at least 6 characters")
    private String password;

    @NotNull(message = "Role is required")
    private UserRole role;

    @NotNull(message = "Gender is required")
    private UserGender gender;

    // Relevant for women operators during shift planning. False means do not assign night shifts.
    private Boolean nightShiftConsent;

    // Required for OPERATOR and MANAGER; null for ADMIN/OWNER
    private Long assignedPumpId;

    private String address;

    // If not provided, auto-generated as EMP-{phone last 4 digits}-{timestamp}
    private String employeeId;

    private LocalDate dateOfJoining;
}
