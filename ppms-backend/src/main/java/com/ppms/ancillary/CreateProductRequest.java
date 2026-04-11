package com.ppms.ancillary;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class CreateProductRequest {

    @NotBlank(message = "Product name is required")
    private String name;

    private String brand;

    private String variant;

    @NotNull(message = "Package size is required")
    @DecimalMin(value = "0.001", message = "Package size must be greater than 0")
    private BigDecimal packageSize;

    @NotNull(message = "Unit of measure is required")
    private UnitOfMeasure unitOfMeasure;

    /** Optional. Null means no low-stock alert is configured. */
    private Integer lowStockThreshold;

    /**
     * Optional. GST rate for this product in percent (e.g. 18.00 for 18%).
     * Defaults to 18% if not provided. Use 0 for GST-exempt products.
     * Valid range: 0–100.
     */
    @DecimalMin(value = "0.00", message = "GST rate must be 0 or greater")
    @DecimalMax(value = "100.00", message = "GST rate cannot exceed 100%")
    private BigDecimal gstRatePercent;
}
