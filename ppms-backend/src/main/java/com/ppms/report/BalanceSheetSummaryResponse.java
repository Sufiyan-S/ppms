package com.ppms.report;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;

@Data
@Builder
public class BalanceSheetSummaryResponse {
    private Long     id;
    private String   reportType;      // "SHIFT" or "DAY"
    private LocalDate reportDate;
    private String   shiftWindow;     // null for DAY
    private String   periodLabel;
    private String   periodLabelCode;
    private Map<String, Object> periodLabelParams;
    private String   generatedByUserName;
    private OffsetDateTime generatedAt;
    private int      shiftCount;      // number of shifts included
    private boolean  stale;
    private String   staleReason;
    private String   staleReasonCode;
    private Map<String, Object> staleReasonParams;
    private int      openShiftCount;

    // Quick summary numbers for the list view
    private BigDecimal totalLitresSold;
    private BigDecimal totalExpectedRevenue;
    private BigDecimal totalGrossProfit;
    private BigDecimal cashDiscrepancy;
}
