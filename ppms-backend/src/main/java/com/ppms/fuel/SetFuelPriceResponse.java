package com.ppms.fuel;

import lombok.Builder;
import lombok.Value;

/**
 * Response for POST /api/fuel-prices.
 *
 * Contains the newly created price record plus an optional warning about open shifts.
 * When openShiftsCount > 0, the frontend should alert the user that existing open shifts
 * will still settle at the OLD price (since price is snapshotted at shift-open time).
 * They should close open shifts before the new price takes effect.
 */
@Value
@Builder
public class SetFuelPriceResponse {

    GlobalFuelPrice price;

    /** Number of currently open shifts at this pump. 0 means no warning needed. */
    int openShiftsCount;

    /** Human-readable warning message. Null when openShiftsCount == 0. */
    String openShiftsWarning;
}
