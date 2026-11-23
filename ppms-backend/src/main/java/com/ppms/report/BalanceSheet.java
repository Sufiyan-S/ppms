package com.ppms.report;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Map;

@Entity
@Table(name = "balance_sheets")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BalanceSheet {
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Kolkata");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "report_type", nullable = false)
    private BalanceSheetReportType reportType;

    @Column(name = "report_date", nullable = false)
    private LocalDate reportDate;

    /**
     * Snapshot of the shift definition's name at report generation time (e.g. "Night Shift").
     * Null for DAY reports. Retained for display even if the definition is later renamed.
     */
    @Column(name = "shift_window")
    private String shiftWindow;

    /**
     * FK to the PumpShiftDefinition used for this SHIFT report.
     * Null for DAY reports. Used to group and query SHIFT-type balance sheets.
     */
    @Column(name = "shift_definition_id")
    private Long shiftDefinitionId;

    /** Human-readable label, e.g. "Shift 1 · 12 AM – 8 AM" */
    @Column(name = "period_label", nullable = false)
    private String periodLabel;

    /** Names periodLabel for translated screens; null with null params on sheets generated before V38. */
    @Column(name = "period_label_code")
    private String periodLabelCode;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "period_label_params", columnDefinition = "jsonb")
    private Map<String, Object> periodLabelParams;

    @Column(name = "generated_by_user_id")
    private Long generatedByUserId;

    @Column(name = "generated_at", nullable = false)
    private OffsetDateTime generatedAt;

    @Column(name = "notes")
    private String notes;

    // ── Cash summary ──────────────────────────────────────────────────────────

    @Column(name = "total_expected_revenue", nullable = false)
    @Builder.Default
    private BigDecimal totalExpectedRevenue = BigDecimal.ZERO;

    @Column(name = "total_cash_collected", nullable = false)
    @Builder.Default
    private BigDecimal totalCashCollected = BigDecimal.ZERO;

    @Column(name = "total_upi_collected", nullable = false)
    @Builder.Default
    private BigDecimal totalUpiCollected = BigDecimal.ZERO;

    @Column(name = "total_card_collected", nullable = false)
    @Builder.Default
    private BigDecimal totalCardCollected = BigDecimal.ZERO;

    @Column(name = "total_fleet_card_collected", nullable = false)
    @Builder.Default
    private BigDecimal totalFleetCardCollected = BigDecimal.ZERO;

    @Column(name = "total_credit_sold", nullable = false)
    @Builder.Default
    private BigDecimal totalCreditSold = BigDecimal.ZERO;

    @Column(name = "total_credit_recovered", nullable = false)
    @Builder.Default
    private BigDecimal totalCreditRecovered = BigDecimal.ZERO;

    @Column(name = "cash_discrepancy", nullable = false)
    @Builder.Default
    private BigDecimal cashDiscrepancy = BigDecimal.ZERO;

    // ── Fuel / profit summary ─────────────────────────────────────────────────

    @Column(name = "total_litres_sold", nullable = false)
    @Builder.Default
    private BigDecimal totalLitresSold = BigDecimal.ZERO;

    @Column(name = "total_litres_delivered", nullable = false)
    @Builder.Default
    private BigDecimal totalLitresDelivered = BigDecimal.ZERO;

    @Column(name = "total_cost_of_goods", nullable = false)
    @Builder.Default
    private BigDecimal totalCostOfGoods = BigDecimal.ZERO;

    @Column(name = "total_gross_profit", nullable = false)
    @Builder.Default
    private BigDecimal totalGrossProfit = BigDecimal.ZERO;

    /** Total monetary loss from maintenance dip entries in this report period. */
    @Column(name = "total_dip_loss_amount", nullable = false)
    @Builder.Default
    private BigDecimal totalDipLossAmount = BigDecimal.ZERO;

    /** Net dip P/L stored at generation. Null on sheets generated before it was stored. */
    @Column(name = "total_dip_net_amount")
    private BigDecimal totalDipNetAmount;

    /** Product sales gross profit stored at generation. Null on sheets generated before it was stored. */
    @Column(name = "product_sales_gross_profit")
    private BigDecimal productSalesGrossProfit;

    /** Approved expenses total stored at generation. Null on sheets generated before it was stored. */
    @Column(name = "total_expenses_amount")
    private BigDecimal totalExpensesAmount;

    /** Sum of cash physically returned by operators for SHORT discrepancies resolved via CASH_RECOVERY on the report date. DAY reports only; always 0 for SHIFT reports. */
    @Column(name = "total_cash_recovery", nullable = false)
    @Builder.Default
    private BigDecimal totalCashRecovery = BigDecimal.ZERO;

    @Column(name = "stale", nullable = false)
    @Builder.Default
    private boolean stale = false;

    @Column(name = "stale_reason", length = 500)
    private String staleReason;

    /** Names staleReason for translated screens; null with null params on sheets marked stale before V38. */
    @Column(name = "stale_reason_code")
    private String staleReasonCode;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "stale_reason_params", columnDefinition = "jsonb")
    private Map<String, Object> staleReasonParams;

    /** Shifts of the report date still open when a live sheet for today was generated. */
    @Column(name = "open_shift_count", nullable = false)
    @Builder.Default
    private int openShiftCount = 0;

    @PrePersist
    protected void onCreate() {
        if (generatedAt == null) {
            generatedAt = OffsetDateTime.now(BUSINESS_ZONE);
        }
    }
}
