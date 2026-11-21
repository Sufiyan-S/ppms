package com.ppms.ancillary;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class UpdateProductRequest {

    /** Optional — if null, the existing value is unchanged. */
    private String brand;

    /** Optional — if null, the existing value is unchanged. */
    private String variant;

    /** Omitted leaves the threshold unchanged; an explicit null clears it (disables the alert). */
    @Min(value = 0, message = "Low stock threshold cannot be negative")
    private Integer lowStockThreshold;

    @JsonIgnore
    private boolean lowStockThresholdProvided;

    public void setLowStockThreshold(Integer lowStockThreshold) {
        this.lowStockThreshold = lowStockThreshold;
        this.lowStockThresholdProvided = true;
    }

    /**
     * Optional. If provided, updates the GST rate for this product.
     * Use 0 for GST-exempt products. If null, the existing rate is unchanged.
     */
    @DecimalMin(value = "0.00", message = "GST rate must be 0 or greater")
    @DecimalMax(value = "100.00", message = "GST rate cannot exceed 100%")
    private BigDecimal gstRatePercent;

    /** Optional. If null, the existing HSN code is unchanged; an empty value removes it. */
    private String hsnCode;
}
