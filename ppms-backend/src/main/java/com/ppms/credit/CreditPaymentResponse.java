package com.ppms.credit;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Data
@Builder
public class CreditPaymentResponse {
    private Long id;
    private Long clientId;
    private BigDecimal amount;
    private String paymentMode;
    private String referenceNo;
    private String notes;
    private LocalDate paidAt;
    private String recordedByUserName;
    private String paymentApprovalStatus;
    private Long approvedByUserId;
    private OffsetDateTime approvedAt;
    private OffsetDateTime createdAt;
}
