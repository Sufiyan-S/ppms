package com.ppms.credit;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class CreateCreditClientRequest {

    @NotBlank(message = "Client name is required")
    private String name;

    @NotBlank(message = "Phone number is required")
    @Pattern(regexp = "\\d{10}", message = "Phone number must be exactly 10 digits")
    private String phone;

    // Optional notes about this client
    private String notes;

    /**
     * Optional. When set, this new client becomes a sub-account (child) of the specified parent.
     * The parent must already exist and belong to the same pump.
     * Maximum nesting depth is 1 — a sub-account cannot itself be a parent.
     */
    private Long parentClientId;
}
