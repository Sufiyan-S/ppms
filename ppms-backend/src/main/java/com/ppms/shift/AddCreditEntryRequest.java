package com.ppms.shift;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class AddCreditEntryRequest {

    @NotBlank(message = "Client name is required")
    private String clientName;

    /** Optional client ID — preferred over name-based lookup when a sub-account is selected. */
    private Long clientId;

    @NotNull(message = "Amount is required")
    @DecimalMin(value = "0.01", message = "Amount must be greater than zero")
    private BigDecimal amount;

    @NotBlank(message = "Fuel type is required")
    private String fuelType;

    // Optional — bill or invoice reference number
    private String billNo;

    // Optional — free-form note, e.g. "given to driver Ravi"
    private String description;

    // Optional — vehicle registration number for fleet tracking, e.g. "MH12AB1234"
    private String vehicleRegistration;

    // Optional — driver name for fleet/company accounts with multiple drivers
    private String driverName;
}
