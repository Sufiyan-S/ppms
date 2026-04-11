package com.ppms.transaction;

import com.ppms.fuel.FuelType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class RecordFuelTransactionRequest {

    @NotNull(message = "Shift ID is required")
    private Long shiftId;

    @NotNull(message = "Nozzle outlet ID is required")
    private Long nozzleOutletId;

    @NotNull(message = "Fuel type is required")
    private FuelType fuelType;

    @NotNull(message = "Quantity is required")
    @DecimalMin(value = "0.001", message = "Quantity must be greater than zero")
    private BigDecimal quantityLitres;

    @NotNull(message = "Price per unit is required")
    @DecimalMin(value = "0.0001", message = "Price per unit must be greater than zero")
    private BigDecimal pricePerUnit;

    @NotNull(message = "Payment mode is required")
    private TransactionPaymentMode paymentMode;

    // Optional — vehicle registration number for fleet tracking
    private String vehicleRegistration;

    // Optional — UTR number for UPI payments
    private String upiReference;

    // Optional — free-form notes
    private String notes;
}
