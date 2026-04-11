package com.ppms.cash;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Records a single cash movement at the pump safe/drawer.
 *
 * Event types:
 *   OPENING_BALANCE — cash in safe at start of day
 *   CASH_IN         — money received (e.g. shift collection deposited to safe)
 *   CASH_OUT        — money taken out (e.g. bank deposit, petty cash withdrawal)
 *   CLOSING_BALANCE — physical count of cash at end of day
 *
 * The running balance is computed from events, not stored, to avoid drift.
 */
@Entity
@Table(name = "cash_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CashEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "event_type", nullable = false)
    private CashEventType eventType;

    @Column(name = "amount", nullable = false)
    private BigDecimal amount;

    @Column(name = "description", nullable = false)
    private String description;

    @Column(name = "event_date", nullable = false)
    private LocalDate eventDate;

    @Column(name = "recorded_by_user_id", nullable = false)
    private Long recordedByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
