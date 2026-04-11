package com.ppms.shift;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "shift_credit_entries")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShiftCreditEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "shift_id", nullable = false)
    private Long shiftId;

    // FK to credit_clients — populated when the client name matches a registered client at shift close.
    // Null for entries where no matching client was found (legacy / unregistered name).
    @Column(name = "client_id")
    private Long clientId;

    // The party who received goods on credit (free-form name, kept for display even if client is deleted)
    @Column(name = "client_name", nullable = false)
    private String clientName;

    // Optional bill or invoice reference number for this credit transaction
    @Column(name = "bill_no")
    private String billNo;

    @Column(name = "amount", nullable = false)
    private BigDecimal amount;

    // Which fuel was given on credit — PETROL, DIESEL, or CNG
    @Column(name = "fuel_type")
    private String fuelType;

    // Free-form note, e.g. "given to driver", "company vehicle", "lorry owner Ravi"
    @Column(name = "description")
    private String description;

    // Optional vehicle registration number (e.g. "MH12AB1234") — useful for fleet tracking
    @Column(name = "vehicle_registration", length = 20)
    private String vehicleRegistration;

    // Optional driver name — useful for fleet/company accounts with multiple drivers
    @Column(name = "driver_name", length = 100)
    private String driverName;

    // ── Void support (spec Section 3.7, Business Rule 7) ──────────────────────
    // ACTIVE by default; set to VOIDED by the void endpoint while shift is still OPEN.
    // Voided entries are retained permanently in the audit trail.

    @Column(name = "void_status", nullable = false)
    @Builder.Default
    private String voidStatus = "ACTIVE";

    @Column(name = "void_reason")
    private String voidReason;

    @Column(name = "voided_by_user_id")
    private Long voidedByUserId;

    @Column(name = "voided_at")
    private OffsetDateTime voidedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
