package com.ppms.fuel;

import lombok.Builder;
import lombok.Value;

import java.math.BigDecimal;

/**
 * Per-fuel-type price resolved for a specific historical date.
 * Used by the backfill shift modal to populate rate fields.
 * pricePerUnit is null when no price record exists on or before the requested date.
 */
@Value
@Builder
public class FuelPriceForDateResponse {
    String fuelType;
    /** Null when no price has been recorded for this fuel type at this pump on or before the date. */
    BigDecimal pricePerUnit;
}
