package com.ppms.credit;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ReassignCreditEntryRequest {

    @NotNull(message = "Target client ID is required")
    private Long toClientId;

    @NotBlank(message = "Reason for reassignment is required")
    private String reason;
}
