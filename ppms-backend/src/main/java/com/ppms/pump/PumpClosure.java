package com.ppms.pump;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Records a day on which a pump is fully closed (holiday, maintenance, dry-day, etc.).
 * The UNIQUE(pump_id, closure_date) constraint prevents duplicate entries for the same day.
 *
 * When a closure exists for today:
 * - ShiftService.openShift() rejects new shifts with a clear error.
 * - The frontend ShiftsPage shows a banner indicating the pump is closed.
 */
@Entity
@Table(name = "pump_closures")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PumpClosure {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "closure_date", nullable = false)
    private LocalDate closureDate;

    @Column(name = "reason", nullable = false, length = 255)
    private String reason;

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
