package com.ppms.report;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "bs_fuel_lines")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BsFuelLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "balance_sheet_id", nullable = false)
    private Long balanceSheetId;

    @Column(name = "fuel_type", nullable = false)
    private String fuelType;

    // ── Stock snapshot ────────────────────────────────────────────────────────
    @Column(name = "opening_stock", nullable = false)
    @Builder.Default private BigDecimal openingStock = BigDecimal.ZERO;

    @Column(name = "closing_stock", nullable = false)
    @Builder.Default private BigDecimal closingStock = BigDecimal.ZERO;

    // ── Tanker deliveries (DAY reports only) ──────────────────────────────────
    @Column(name = "delivered_litres", nullable = false)
    @Builder.Default private BigDecimal deliveredLitres = BigDecimal.ZERO;

    @Column(name = "delivered_cost", nullable = false)
    @Builder.Default private BigDecimal deliveredCost = BigDecimal.ZERO;

    // ── Fuel sold ─────────────────────────────────────────────────────────────
    @Column(name = "sold_litres", nullable = false)
    @Builder.Default private BigDecimal soldLitres = BigDecimal.ZERO;

    @Column(name = "selling_price", nullable = false)
    @Builder.Default private BigDecimal sellingPrice = BigDecimal.ZERO;

    @Column(name = "expected_revenue", nullable = false)
    @Builder.Default private BigDecimal expectedRevenue = BigDecimal.ZERO;

    @Column(name = "cost_of_goods", nullable = false)
    @Builder.Default private BigDecimal costOfGoods = BigDecimal.ZERO;

    @Column(name = "gross_profit", nullable = false)
    @Builder.Default private BigDecimal grossProfit = BigDecimal.ZERO;

    // ── Credit ────────────────────────────────────────────────────────────────
    @Column(name = "credit_sold_amount", nullable = false)
    @Builder.Default private BigDecimal creditSoldAmount = BigDecimal.ZERO;

    // ── DIP variance / maintenance loss ──────────────────────────────────────
    /** Litres physically removed via maintenance dip for this fuel type. */
    @Column(name = "stock_variance", nullable = false)
    @Builder.Default private BigDecimal stockVariance = BigDecimal.ZERO;

    @Column(name = "dip_loss_litres", nullable = false)
    @Builder.Default private BigDecimal dipLossLitres = BigDecimal.ZERO;

    @Column(name = "dip_loss_amount", nullable = false)
    @Builder.Default private BigDecimal dipLossAmount = BigDecimal.ZERO;
}
