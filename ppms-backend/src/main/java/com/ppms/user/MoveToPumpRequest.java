package com.ppms.user;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class MoveToPumpRequest {

    @NotNull(message = "Pick the pump to move this staff member to")
    private Long pumpId;
}
