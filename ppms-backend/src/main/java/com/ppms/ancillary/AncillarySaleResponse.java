package com.ppms.ancillary;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Data
@Builder
public class AncillarySaleResponse {

    private Long   id;
    private Long   pumpId;
    private Long   productId;
    private String productDisplayName;
    private Integer quantityUnits;
    private BigDecimal sellingPricePerUnit;
    private BigDecimal totalAmount;
    private BigDecimal gstAmount;
    private BigDecimal totalWithGst;
    private String paymentMode;
    private Long   clientId;
    private String clientName;
    private String billNo;
    private String notes;
    private Long   soldByUserId;
    private LocalDate saleDate;
    private OffsetDateTime createdAt;
}
