package com.ppms.user;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateStaffDetailsRequest {
    @Size(max = 100, message = "Full name must not exceed 100 characters")
    private String fullName;
    @Pattern(regexp = "\\d{10}", message = "Phone number must be exactly 10 digits")
    private String phoneNumber;
    private UserRole role;
    private UserGender gender;
    private Boolean nightShiftConsent;
}
