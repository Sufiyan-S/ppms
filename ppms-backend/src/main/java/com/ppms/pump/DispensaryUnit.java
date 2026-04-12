package com.ppms.pump;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;

/**
 * Represents a physical dispensing machine (MPD — Multi Product Dispenser) at a pump station.
 *
 * One DU houses 1–9 individual nozzles (pipes), each dispensing a single fuel type.
 * A DU may be partially occupied: two operators can share the same DU if they take
 * different nozzles — each gets their own shift record.
 *
 * du_number is auto-assigned per pump (1–20) and forms the display label.
 * name is user-provided (e.g. "Machine 1", "DU-A").
 */
@Entity
@Table(name = "dispensary_units")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DispensaryUnit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    /** Pump-scoped sequential number (1–20). Auto-assigned on creation. */
    @Column(name = "du_number", nullable = false)
    private Integer duNumber;

    /** User-provided display name for this DU (e.g. "Machine 1"). */
    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private NozzleStatus status = NozzleStatus.ACTIVE;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
        updatedAt = OffsetDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
