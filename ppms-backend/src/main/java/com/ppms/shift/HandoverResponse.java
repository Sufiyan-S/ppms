package com.ppms.shift;

import lombok.Builder;
import lombok.Value;

import java.time.OffsetDateTime;

@Value
@Builder
public class HandoverResponse {
    Long id;
    Long pumpId;
    Long outgoingShiftId;
    Long outgoingOperatorId;
    String outgoingOperatorName;
    Long incomingOperatorId;
    String incomingOperatorName;
    boolean physicalCashVerified;
    boolean meterReadingsVerified;
    String notes;
    OffsetDateTime handoverTime;
    OffsetDateTime createdAt;
}
