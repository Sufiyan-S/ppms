package com.ppms.document;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Tracks a compliance document (licence, certificate, permit) for a pump.
 * Status is auto-computed from expiry_date whenever the entity is loaded:
 *   - EXPIRED        — expiry_date is in the past
 *   - EXPIRING_SOON  — expiry_date is within the next 30 days
 *   - VALID          — expiry_date is > 30 days away, or no expiry_date set
 */
@Entity
@Table(name = "pump_documents")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PumpDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "doc_type", nullable = false)
    private String docType;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    private DocumentStatus status;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @Column(name = "notes")
    private String notes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = updatedAt = OffsetDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
