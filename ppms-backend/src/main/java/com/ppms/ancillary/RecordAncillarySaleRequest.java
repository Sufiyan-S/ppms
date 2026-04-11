package com.ppms.ancillary;

import com.ppms.transaction.TransactionPaymentMode;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class RecordAncillarySaleRequest {

    @NotNull(message = "Product ID is required")
    private Long productId;

    @NotNull(message = "Quantity is required")
    @Min(value = 1, message = "Quantity must be at least 1 unit")
    private Integer quantityUnits;

    /**
     * Selling price per unit entered by the operator at point of sale.
     * This is the MRP (inclusive of all taxes) — GST is NOT added on top.
     */
    @NotNull(message = "Selling price per unit is required")
    @DecimalMin(value = "0.01", message = "Selling price must be greater than 0")
    private BigDecimal sellingPricePerUnit;

    @NotNull(message = "Payment mode is required")
    private TransactionPaymentMode paymentMode;

    /** Optional. FK to credit_clients table for known credit clients. */
    private Long clientId;

    /**
     * Optional for non-credit sales.
     * Required when payment mode is CREDIT — used as the display name on receipts/ledger.
     */
    private String clientName;

    private String billNo;

    private String notes;
}
