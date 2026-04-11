package com.ppms.auth;

import com.ppms.user.UserRole;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class LoginResponse {
    private String token;
    private Long userId;
    private String fullName;
    private String phoneNumber;
    private UserRole role;
    private Long assignedPumpId;    // null for OWNER
}
