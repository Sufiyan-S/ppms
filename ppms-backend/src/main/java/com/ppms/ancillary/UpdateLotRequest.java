package com.ppms.ancillary;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * Request body for PATCH .../lots/{lotId}.
 * Both fields are optional — only non-null fields are applied.
 */
@Getter
@Setter
@NoArgsConstructor
public class UpdateLotRequest {

    /** New cost price per unit. Must be > 0 if provided. */
    private BigDecimal costPricePerUnit;

    /**
     * New remaining quantity. Must be >= 0 and <= originalQuantity.
     * The delta is applied to product.currentStockUnits automatically.
     */
    private Integer remainingQuantity;
}
