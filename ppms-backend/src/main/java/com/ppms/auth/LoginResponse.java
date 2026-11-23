package com.ppms.auth;

import com.ppms.user.User;
import com.ppms.user.UserRole;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class LoginResponse {
    private Long userId;
    private String fullName;
    private String phoneNumber;
    private UserRole role;
    private Long assignedPumpId;    // null for OWNER
    private boolean mustChangePassword;
    private String preferredLanguage;

    public static LoginResponse from(User user) {
        return LoginResponse.builder()
                .userId(user.getId())
                .fullName(user.getFullName())
                .phoneNumber(user.getPhoneNumber())
                .role(user.getRole())
                .assignedPumpId(user.getAssignedPumpId())
                .mustChangePassword(user.isMustChangePassword())
                .preferredLanguage(user.getPreferredLanguage())
                .build();
    }
}
