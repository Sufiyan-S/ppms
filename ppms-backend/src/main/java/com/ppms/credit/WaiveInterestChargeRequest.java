package com.ppms.credit;

import jakarta.validation.constraints.NotBlank;

public record WaiveInterestChargeRequest(
        @NotBlank(message = "A reason is required to waive an interest charge")
        String reason
) {}
