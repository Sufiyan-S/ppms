package com.ppms.user;

import com.ppms.auth.PasswordPolicy;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;

@Data
public class CreateUserRequest {

    @NotBlank(message = "Full name is required")
    @Size(max = 100, message = "Full name must not exceed 100 characters")
    private String fullName;

    @NotBlank(message = "Phone number is required")
    @Pattern(regexp = "\\d{10}", message = "Phone number must be exactly 10 digits")
    private String phoneNumber;

    @NotBlank(message = "Password is required")
    @Pattern(regexp = PasswordPolicy.REGEX, message = PasswordPolicy.MESSAGE)
    private String password;

    @NotNull(message = "Role is required")
    private UserRole role;

    @NotNull(message = "Gender is required")
    private UserGender gender;

    // Relevant for women operators during shift planning. False means do not assign night shifts.
    private Boolean nightShiftConsent;

    // Required for OPERATOR and MANAGER; null for ADMIN/OWNER
    private Long assignedPumpId;

    @Size(max = 200, message = "Address must not exceed 200 characters")
    private String address;

    // If not provided, auto-generated as EMP-{phone last 4 digits}-{timestamp}
    @Size(max = 50, message = "Employee ID must not exceed 50 characters")
    private String employeeId;

    private LocalDate dateOfJoining;

    // Optional; English when left out
    @Pattern(regexp = UserLanguage.PATTERN, message = UserLanguage.MESSAGE)
    private String preferredLanguage;
}
