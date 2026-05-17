package com.ppms.inventory;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "tankers")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Tanker {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "capacity_litres", nullable = false, precision = 10, scale = 2)
    private BigDecimal capacityLitres;

    @Enumerated(EnumType.STRING)
    @Column(name = "tanker_type", nullable = false)
    private TankerType tankerType;

    /** Stored in column is_default — field named defaultTanker to avoid Lombok/Jackson isXxx conflict. */
    @Column(name = "is_default", nullable = false)
    private boolean defaultTanker;

    /** Stored in column is_active — soft-delete: hides from dropdown but preserves history. */
    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
