package com.ppms.inventory;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Read model for a single FIFO inventory lot, returned by GET .../tanks/{tankId}/lots.
 * Used by the "View Lots" dialog on the Inventory page — read-only, no edit.
 * Includes invoice reference from the linked TankerDelivery (null for DIP adjustment lots).
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryLotDetailResponse {

    private Long id;
    private Long tankerDeliveryId;
    private OffsetDateTime deliveryDate;
    /**
     * Invoice / bill number from the linked tanker delivery.
     * Null for DIP-adjustment lots (no delivery triggered them).
     */
    private String invoiceReference;
    private BigDecimal costPricePerUnit;
    private BigDecimal remainingQuantity;
    private BigDecimal originalQuantity;
    /**
     * True when this lot was created from a DIP upward adjustment, not a tanker delivery.
     * These lots have costPricePerUnit = 0 and no invoiceReference.
     */
    private Boolean isDipAdjustment;
    /** Always ACTIVE — exhausted lots are excluded from this response. */
    private String status;
    private OffsetDateTime createdAt;
}
