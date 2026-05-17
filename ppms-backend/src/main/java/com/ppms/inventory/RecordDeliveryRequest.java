package com.ppms.inventory;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class RecordDeliveryRequest {

    @NotNull(message = "Tank is required")
    private Long tankId;

    @NotNull(message = "Quantity delivered is required")
    @DecimalMin(value = "0.001", message = "Quantity must be greater than 0")
    private BigDecimal quantityDelivered;

    @NotNull(message = "Cost price per unit is required")
    @DecimalMin(value = "0.0001", message = "Cost price must be greater than 0")
    private BigDecimal costPricePerUnit;

    @NotNull(message = "Delivery date is required")
    private LocalDate deliveryDate;

    @NotBlank(message = "Invoice reference is required")
    private String invoiceReference;

    /** Actual bill total (optional — may include freight, taxes, other charges). */
    @DecimalMin(value = "0.01", message = "Bill total must be greater than 0")
    private BigDecimal billTotal;
}
