package com.ppms.credit;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record CreditBalanceLookupRequest(
        @NotNull Long pumpId,
        @NotBlank @Pattern(regexp = "\\d{10}", message = "Phone must be 10 digits") String phone,
        @NotBlank @Pattern(regexp = "\\d{4,6}", message = "PIN must be 4 to 6 digits") String pin) {
}
