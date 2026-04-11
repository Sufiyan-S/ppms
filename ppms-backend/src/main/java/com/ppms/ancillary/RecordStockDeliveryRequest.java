package com.ppms.ancillary;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class RecordStockDeliveryRequest {

    @NotNull(message = "Quantity is required")
    @Min(value = 1, message = "Quantity must be at least 1 unit")
    private Integer quantityUnits;

    @NotNull(message = "Cost price per unit is required")
    @DecimalMin(value = "0.01", message = "Cost price must be at least 0.01")
    private BigDecimal costPricePerUnit;

    @NotNull(message = "Delivery date is required")
    private LocalDate deliveryDate;

    private String invoiceReference;

    private String notes;
}
