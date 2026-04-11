package com.ppms.pump;

import jakarta.validation.constraints.NotNull;

public record UpdateNozzleStatusRequest(
        @NotNull NozzleStatus status
) {}
