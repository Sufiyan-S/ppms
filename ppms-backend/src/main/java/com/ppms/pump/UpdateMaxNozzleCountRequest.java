package com.ppms.pump;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record UpdateMaxNozzleCountRequest(
        @NotNull @Min(1) @Max(20) Integer maxNozzleCount
) {}
