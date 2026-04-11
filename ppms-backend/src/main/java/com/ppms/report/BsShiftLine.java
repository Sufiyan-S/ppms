package com.ppms.report;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "bs_shift_lines")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BsShiftLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "balance_sheet_id", nullable = false)
    private Long balanceSheetId;

    /** Stored as data, not a FK — report survives shift cleanup */
    @Column(name = "shift_id", nullable = false)
    private Long shiftId;

    @Column(name = "operator_name", nullable = false)
    private String operatorName;

    @Column(name = "nozzle_number", nullable = false)
    private Integer nozzleNumber;

    /** Comma-separated fuel types sold in this shift, e.g. "PETROL, DIESEL" */
    @Column(name = "fuel_types_summary", nullable = false)
    private String fuelTypesSummary;

    @Column(name = "litres_sold", nullable = false)
    @Builder.Default private BigDecimal litresSold = BigDecimal.ZERO;

    @Column(name = "expected_revenue", nullable = false)
    @Builder.Default private BigDecimal expectedRevenue = BigDecimal.ZERO;

    @Column(name = "cash_collected", nullable = false)
    @Builder.Default private BigDecimal cashCollected = BigDecimal.ZERO;

    @Column(name = "upi_collected", nullable = false)
    @Builder.Default private BigDecimal upiCollected = BigDecimal.ZERO;

    @Column(name = "card_collected", nullable = false)
    @Builder.Default private BigDecimal cardCollected = BigDecimal.ZERO;

    @Column(name = "fleet_card_collected", nullable = false)
    @Builder.Default private BigDecimal fleetCardCollected = BigDecimal.ZERO;

    @Column(name = "credit_amount", nullable = false)
    @Builder.Default private BigDecimal creditAmount = BigDecimal.ZERO;

    @Column(name = "discrepancy", nullable = false)
    @Builder.Default private BigDecimal discrepancy = BigDecimal.ZERO;
}
