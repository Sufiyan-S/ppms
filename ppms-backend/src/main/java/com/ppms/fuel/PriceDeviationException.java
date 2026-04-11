package com.ppms.fuel;

import java.math.BigDecimal;

/**
 * Thrown when a new fuel price deviates >15% from the last recorded price and
 * the request has not explicitly confirmed the change (spec Business Rule 37).
 * Caught by GlobalExceptionHandler and converted to HTTP 409.
 */
public class PriceDeviationException extends RuntimeException {

    private final BigDecimal lastPrice;
    private final BigDecimal newPrice;
    private final BigDecimal deviationPercent;

    public PriceDeviationException(BigDecimal lastPrice, BigDecimal newPrice, BigDecimal deviationPercent) {
        super("Fuel price deviation exceeds 15%");
        this.lastPrice = lastPrice;
        this.newPrice = newPrice;
        this.deviationPercent = deviationPercent;
    }

    public BigDecimal getLastPrice()        { return lastPrice; }
    public BigDecimal getNewPrice()         { return newPrice; }
    public BigDecimal getDeviationPercent() { return deviationPercent; }
}
