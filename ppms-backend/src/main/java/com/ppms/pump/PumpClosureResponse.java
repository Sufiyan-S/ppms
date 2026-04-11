package com.ppms.pump;

import lombok.Builder;
import lombok.Value;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Value
@Builder
public class PumpClosureResponse {
    Long id;
    Long pumpId;
    LocalDate closureDate;
    String reason;
    Long createdByUserId;
    String createdByName;
    OffsetDateTime createdAt;
}
