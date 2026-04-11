package com.ppms.supplier;

import lombok.Builder;
import lombok.Value;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Value
@Builder
public class SupplierPaymentResponse {
    Long id;
    Long pumpId;
    Long supplierId;
    String supplierName;
    Long deliveryId;
    BigDecimal amount;
    LocalDate paymentDate;
    String paymentMode;
    String referenceNo;
    String notes;
    Long recordedByUserId;
    String recordedByName;
    OffsetDateTime createdAt;
}
