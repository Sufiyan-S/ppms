package com.ppms.planning;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "shift_plan_entry")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class ShiftPlanEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "shift_plan_id", nullable = false)
    private Long shiftPlanId;

    @Column(name = "shift_date", nullable = false)
    private LocalDate shiftDate;

    /**
     * FK to the pump_shift_definition this entry is planned for.
     * Replaces the old ShiftWindow enum — shift slots are now defined dynamically by admin.
     */
    @Column(name = "shift_definition_id")
    private Long shiftDefinitionId;

    @Column(name = "operator_user_id", nullable = false)
    private Long operatorUserId;

    /**
     * PLANNED  → assigned in plan, not yet opened
     * CONFIRMED → operator showed up, shift opened as planned
     * ABSENT   → shift opened with a different operator
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ShiftPlanEntryStatus status;

    /** Optional note — e.g. "Covering for Ahmed (emergency)" */
    @Column(name = "note", length = 200)
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    void prePersist() {
        createdAt = OffsetDateTime.now();
    }
}
