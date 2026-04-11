package com.ppms.planning;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;

@Entity
@Table(name = "staff_preference")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class StaffPreference {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    /**
     * FK to the preferred shift definition for this operator.
     * Null means no shift preference (any shift is acceptable).
     * Replaces the old ShiftWindow enum field.
     */
    @Column(name = "preferred_shift_definition_id")
    private Long preferredShiftDefinitionId;

    /**
     * Which day of the week this operator prefers off.
     * Null means no fixed day-off preference.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "preferred_day_off")
    private PreferredDayOff preferredDayOff;

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
