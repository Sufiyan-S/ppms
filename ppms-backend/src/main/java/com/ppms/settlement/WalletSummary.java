package com.ppms.settlement;

import java.math.BigDecimal;
import lombok.Builder;
import lombok.Data;

@Data @Builder
public class WalletSummary {
    /** Running balance (all-time collected − all-time settled) per type. */
    private BigDecimal upiPending;
    private BigDecimal cardPending;
    private BigDecimal fleetCardPending;
    private BigDecimal totalPending;
}
