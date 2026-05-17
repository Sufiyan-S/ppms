package com.ppms.inventory;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Request body for POST /api/inventory/{pumpId}/deliveries/batch
 *
 * Used when a single tanker delivers multiple fuel types in one trip
 * (same invoice, same date, multiple tanks). All line items are saved
 * in a single transaction so a partial failure cannot leave the stock
 * in an inconsistent state.
 */
@Data
public class RecordBatchDeliveryRequest {

    @NotNull(message = "Delivery date is required")
    private LocalDate deliveryDate;

    @NotBlank(message = "Invoice reference is required")
    private String invoiceReference;

    /** At least one tank must be included per batch */
    @NotEmpty(message = "At least one delivery item is required")
    @Valid
    private List<LineItem> items;

    /**
     * Actual total from the physical bill (may include freight, taxes, or other charges beyond qty × cost).
     * Optional — omit to leave it unrecorded. Stored on every row of the batch, all sharing the same value.
     */
    @DecimalMin(value = "0.01", message = "Bill total must be greater than 0")
    private BigDecimal billTotal;

    /**
     * ID of the tanker (truck) that made this delivery.
     * When provided the backend validates that sum(quantityDelivered) equals the tanker's capacity.
     */
    private Long tankerId;

    @Data
    public static class LineItem {

        @NotNull(message = "Tank is required")
        private Long tankId;

        @NotNull(message = "Quantity delivered is required")
        @DecimalMin(value = "0.001", message = "Quantity must be greater than 0")
        private BigDecimal quantityDelivered;

        /** Null is allowed — backend will use the last recorded price for this tank. */
        @DecimalMin(value = "0.0001", message = "Cost price must be greater than 0")
        private BigDecimal costPricePerUnit;
    }
}
