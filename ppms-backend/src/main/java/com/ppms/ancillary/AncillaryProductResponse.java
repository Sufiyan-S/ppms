package com.ppms.ancillary;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

@Data
@Builder
public class AncillaryProductResponse {

    private Long   id;
    private Long   pumpId;
    private String name;
    private String brand;
    private String variant;
    private BigDecimal packageSize;
    private String unitOfMeasure;
    private Integer currentStockUnits;
    private Integer lowStockThreshold;
    private String status;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    /**
     * Cost price per unit from the oldest active FIFO stock lot.
     * Shown on the product card as a quick reference.
     * Null when there are no active lots (out of stock).
     */
    private BigDecimal fifoCostPricePerUnit;

    /**
     * All active FIFO lots in consumption order (oldest delivery date first).
     * Used by the SellDialog to compute a per-batch projected profit that correctly
     * accounts for sales spanning multiple purchase batches at different costs.
     * Empty when the product has no stock.
     */
    private List<FifoLotSummary> activeFifoLots;

    /**
     * Human-readable display name composed from brand + name + variant + packageSize + unit.
     * Example: "Castrol GTX 10W-40 — 1.000 L"
     */
    private String displayName;

    /**
     * Lightweight lot summary for FIFO profit projection.
     * Contains only the fields needed to walk through lots in order and compute COGS.
     */
    @Data
    @Builder
    public static class FifoLotSummary {
        /** Units remaining in this lot — how many can still be consumed from it. */
        private Integer remainingQuantity;
        /** Cost price captured at delivery time — immutable after lot creation. */
        private BigDecimal costPricePerUnit;
    }
}
