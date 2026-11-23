package com.ppms.settlement;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import lombok.Builder;
import lombok.Data;

@Data @Builder
public class SettlementResponse {
    private Long   id;
    private Long   pumpId;
    private String paymentType;
    private String settlementDate;
    private BigDecimal amountReceived;
    private String notes;
    private String bankReference;
    private String recordedByUserName;
    private String createdAt;
    /** Wallet balance for this payment type at the time of recording. Null for legacy entries. */
    private BigDecimal pendingAtRecordTime;
    /** True when amountReceived was less than the pending balance at record time (partial settlement). */
    @JsonProperty("isPartial")
    private boolean isPartial;
    /** ACTIVE or VOIDED. Voided settlements are excluded from wallet and daily totals. */
    private String voidStatus;
    private String voidReason;
    private String voidedAt;
}
