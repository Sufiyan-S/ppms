package com.ppms.report;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

@Data
@Builder
public class BalanceSheetDetailResponse {

    private Long     id;
    private Long     pumpId;
    private String   reportType;
    private LocalDate reportDate;
    private String   shiftWindow;
    private String   periodLabel;
    private String   generatedByUserName;
    private OffsetDateTime generatedAt;
    private String   notes;

    /**
     * Distinct shift definition names included in this report (DAY reports only).
     * Derived from the shiftName snapshot stored on each Shift at open time.
     * Null for SHIFT reports.
     */
    private List<String> includedShiftNames;

    // ── Cash summary ──────────────────────────────────────────────────────────
    private BigDecimal totalExpectedRevenue;
    private BigDecimal totalCashCollected;
    private BigDecimal totalUpiCollected;
    private BigDecimal totalCardCollected;
    private BigDecimal totalFleetCardCollected;
    private BigDecimal totalCreditSold;
    private BigDecimal totalCreditRecovered;
    /** Cash physically returned by operators for SHORT discrepancies resolved via CASH_RECOVERY on the report date. DAY reports only; 0 for SHIFT reports. */
    private BigDecimal totalCashRecovery;
    private BigDecimal cashDiscrepancy;

    // ── Fuel / profit summary ─────────────────────────────────────────────────
    private BigDecimal totalLitresSold;
    private BigDecimal totalLitresDelivered;
    private BigDecimal totalCostOfGoods;
    private BigDecimal totalGrossProfit;
    /**
     * Net Dip P/L = sum of all dip entries monetary amounts.
     * Negative = net loss (losses outweigh gains); Positive = net gain (surplus found).
     * Includes both MAINTENANCE_REMOVAL losses and DIP_CHECK variance gains/losses.
     */
    private BigDecimal totalDipNetAmount;
    /**
     * Net profit = gross profit + totalDipNetAmount.
     * totalDipNetAmount is signed: negative reduces profit (losses), positive increases it (gains).
     */
    private BigDecimal totalNetProfit;

    // ── Detail lines ──────────────────────────────────────────────────────────
    private List<BsFuelLineResponse>        fuelLines;
    private List<BsShiftLineResponse>       shiftLines;
    /**
     * Meter reading amendments (RESET / CUSTOM_READING) that occurred during this report period.
     * Informational only — no financial impact. Empty list when none occurred.
     */
    private List<MeterAmendmentLineResponse> meterAmendments;
    /**
     * Individual Dip P/L entries for this report period — one per FuelDipEntry (maintenance removal)
     * and one per DipCheck record. Sorted chronologically by recordedAt.
     * Empty list when no dip activity occurred.
     */
    private List<DipPlLineResponse> dipPlEntries;

    /**
     * Product sales (ancillary) summary for the report date.
     * Includes revenue, COGS, and gross margin for non-fuel product counter sales.
     * Only populated for DAY reports. Null for SHIFT reports or when there are no sales.
     */
    private ProductSalesSummary productSales;

    /**
     * Approved operational expenses for the report date.
     * Only populated for DAY reports. Null for SHIFT reports or when there are no approved expenses.
     */
    private ExpenseSummary expenses;

    /**
     * Payment settlement status for UPI, Card, and Fleet Card on the report date.
     * Shows what was collected in shifts vs what arrived in the bank (settled) on that date,
     * plus the cumulative pending wallet balance as context.
     * Only populated for DAY reports. Null for SHIFT reports.
     */
    private SettlementSummary settlementSummary;

    // ── Nested: ancillary product sales summary ────────────────────────────────

    @Data
    @Builder
    public static class ProductSalesSummary {
        private java.math.BigDecimal totalRevenue;
        private java.math.BigDecimal totalCogs;
        private java.math.BigDecimal grossProfit;
        private java.util.List<ProductLine> productLines;
    }

    @Data
    @Builder
    public static class ProductLine {
        private Long   productId;
        private String productName;
        private int    unitsSold;
        private java.math.BigDecimal revenue;
        private java.math.BigDecimal cogs;
    }

    // ── Nested: approved expense summary ──────────────────────────────────────

    @Data
    @Builder
    public static class ExpenseSummary {
        private java.math.BigDecimal totalAmount;
        private java.util.List<ExpenseLine> lines;
    }

    @Data
    @Builder
    public static class ExpenseLine {
        private Long   id;
        private String category;
        private String description;
        private java.math.BigDecimal amount;
        private String recordedByName;
    }

    // ── Nested: settlement summary (DAY reports only) ──────────────────────────

    @Data
    @Builder
    public static class SettlementSummary {
        /** Amount settled (arrived in bank) on the report date, per payment type. */
        private java.math.BigDecimal upiSettledOnDate;
        private java.math.BigDecimal cardSettledOnDate;
        private java.math.BigDecimal fleetCardSettledOnDate;
        /**
         * Cumulative wallet balance as of the report date:
         * pending = SUM(collected in all shifts up to reportDate) − SUM(all settlements up to reportDate)
         * A positive value means funds are still in transit and not yet credited to the bank account.
         */
        private java.math.BigDecimal walletUpiPending;
        private java.math.BigDecimal walletCardPending;
        private java.math.BigDecimal walletFleetCardPending;
        /** Individual settlement entries recorded for the report date — for drill-down. */
        private java.util.List<SettlementLine> settlementsOnDate;
    }

    @Data
    @Builder
    public static class SettlementLine {
        private Long   id;
        private String paymentType;
        private java.math.BigDecimal amountReceived;
        private String notes;
        private String recordedByUserName;
        private java.time.OffsetDateTime createdAt;
    }
}
