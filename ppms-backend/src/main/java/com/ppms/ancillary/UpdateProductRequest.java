package com.ppms.ancillary;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class UpdateProductRequest {

    /** Optional — if null, the existing value is unchanged. */
    private String brand;

    /** Optional — if null, the existing value is unchanged. */
    private String variant;

    /**
     * Optional. Pass null to clear the threshold (disable the alert).
     * The controller uses a separate null-check to distinguish "not provided" from "explicitly cleared".
     * A dedicated PATCH body means the field being present with null value clears it.
     */
    private Integer lowStockThreshold;

    /**
     * Optional. If provided, updates the GST rate for this product.
     * Use 0 for GST-exempt products. If null, the existing rate is unchanged.
     */
    @DecimalMin(value = "0.00", message = "GST rate must be 0 or greater")
    @DecimalMax(value = "100.00", message = "GST rate cannot exceed 100%")
    private BigDecimal gstRatePercent;
}
