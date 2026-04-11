package com.ppms.pump;

import jakarta.validation.constraints.NotNull;

public record UpdateTankStatusRequest(

        @NotNull(message = "Status is required (ACTIVE or INACTIVE)")
        TankStatus status
) {}
