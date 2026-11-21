package com.ppms.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class LoginRequest {

    @NotBlank(message = "Phone number is required")
    private String phoneNumber;

    @NotBlank(message = "Password is required")
    @Size(max = PasswordPolicy.MAX_LENGTH, message = "Password must be at most 72 characters")
    private String password;
}
