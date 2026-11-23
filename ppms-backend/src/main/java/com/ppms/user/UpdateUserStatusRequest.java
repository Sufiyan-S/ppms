package com.ppms.user;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class UpdateUserStatusRequest {

    @NotNull(message = "Status is required (ACTIVE or INACTIVE)")
    private UserStatus status;
}
