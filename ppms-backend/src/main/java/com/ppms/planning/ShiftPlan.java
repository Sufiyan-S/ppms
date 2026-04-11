package com.ppms.planning;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "shift_plan")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class ShiftPlan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    /** Always the Monday of the planned week. */
    @Column(name = "week_start", nullable = false)
    private LocalDate weekStart;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ShiftPlanStatus status;

    /** How many operators to assign per Morning (SHIFT_2) and Evening (SHIFT_3) slot. */
    @Column(name = "operators_per_day_shift", nullable = false)
    private int operatorsPerDayShift;

    /** How many operators to assign per Night (SHIFT_1) slot. */
    @Column(name = "operators_per_night_shift", nullable = false)
    private int operatorsPerNightShift;

    @Column(name = "created_by_user_id")
    private Long createdByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    void prePersist() {
        createdAt = OffsetDateTime.now();
        updatedAt = createdAt;
    }
}
