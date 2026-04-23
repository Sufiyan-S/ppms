package com.ppms.ancillary;

import com.ppms.transaction.TransactionPaymentMode;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

/**
 * Request body for retroactively recording a historical ancillary counter sale.
 * The selling price is NOT provided by the caller — it is resolved automatically
 * from the product's price history for the given sale date.
 *
 * Restrictions enforced at the service layer:
 * - saleDate must be strictly before today (IST).
 * - At least one active stock lot must have been delivered on or before saleDate.
 * - Total units across those historical lots must cover the requested quantity.
 * - Only ADMIN and OWNER roles are permitted.
 */
@Data
public class BackfillSaleRequest {

    @NotNull(message = "Product ID is required")
    private Long productId;

    /**
     * The historical date on which this sale occurred.
     * Must be strictly before today. Validated in the service (not via @Past)
     * to ensure IST-aware comparison.
     */
    @NotNull(message = "Sale date is required")
    private LocalDate saleDate;

    @NotNull(message = "Quantity is required")
    @Min(value = 1, message = "Quantity must be at least 1 unit")
    private Integer quantityUnits;

    @NotNull(message = "Payment mode is required")
    private TransactionPaymentMode paymentMode;

    /**
     * Required when paymentMode is CREDIT. Used as the display name on ledger entries.
     */
    private String clientName;

    private String billNo;

    private String notes;
}
