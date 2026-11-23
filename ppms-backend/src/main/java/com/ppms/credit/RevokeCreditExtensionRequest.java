package com.ppms.credit;

import jakarta.validation.constraints.NotBlank;

public record RevokeCreditExtensionRequest(
        @NotBlank(message = "A reason is required to revoke a credit extension")
        String reason
) {}
