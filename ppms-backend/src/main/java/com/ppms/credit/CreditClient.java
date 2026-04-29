package com.ppms.credit;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@Entity
@Table(name = "credit_clients")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreditClient {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    // The name that appears in the credit entry dropdown — unique per pump
    @Column(name = "name", nullable = false)
    private String name;

    // Optional contact number for the client
    @Column(name = "phone")
    private String phone;

    // Optional notes (e.g. "Fleet manager for ABC Transports")
    @Column(name = "notes")
    private String notes;

    // Maximum outstanding balance allowed; 0 means no limit enforced
    @Column(name = "credit_limit", nullable = false)
    @Builder.Default
    private BigDecimal creditLimit = BigDecimal.ZERO;

    /**
     * Billing cycle: how often the customer is billed and overdue status is assessed.
     * A customer whose billing cycle ends with an unpaid balance is blocked from new credit sales
     * until settled or an Admin/Owner grants a Credit Extension (spec Section 3.6, Business Rule 51).
     */
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "billing_cycle", nullable = false)
    @Builder.Default
    private BillingCycle billingCycle = BillingCycle.MONTHLY;

    /**
     * Interest period: how frequently interest is calculated and staged (spec Section 3.6).
     * Independent of billing_cycle — a customer can have monthly billing with weekly interest.
     */
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "interest_period", nullable = false)
    @Builder.Default
    private InterestPeriod interestPeriod = InterestPeriod.MONTHLY;

    /**
     * Simple interest rate charged per calendar month on the outstanding balance.
     * 0.00 means no interest is charged for this client.
     * Configurable by Owner/Admin per client.
     */
    @Column(name = "monthly_interest_rate", nullable = false)
    @Builder.Default
    private BigDecimal monthlyInterestRate = BigDecimal.ZERO;

    /**
     * Number of days after the first unpaid credit entry before interest starts accruing.
     * Default 1 — interest begins the day after the first sale on credit.
     */
    @Column(name = "interest_grace_days", nullable = false)
    @Builder.Default
    private Integer interestGraceDays = 1;

    /**
     * FK to credit_clients(id). Null for root/parent accounts.
     * Non-null means this is a sub-account. Application enforces max 1 level of nesting.
     */
    @Column(name = "parent_client_id")
    private Long parentClientId;

    /**
     * False when the owner has soft-disabled this client.
     * Disabled clients are excluded from shift credit-entry dropdowns and sorted
     * to the bottom of the Clients list. All historical data is preserved.
     */
    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean isActive = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now(ZoneOffset.UTC);
    }
}
