package com.ppms.credit;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * A time-bound override granted by Admin or Owner when a credit customer is blocked
 * due to an exhausted credit limit or an overdue billing cycle (spec Section 3.6).
 *
 * Key rules:
 * - Expiry date is always mandatory — open-ended extensions are not permitted (Business Rule 58).
 * - Only one ACTIVE extension of each type per client per pump (Business Rule 60).
 * - Extensions are pump-scoped — an extension at Pump A does not affect Pump B (Business Rule 59).
 */
@Entity
@Table(name = "credit_extensions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreditExtension {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "client_id", nullable = false)
    private Long clientId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "extension_type", nullable = false)
    private CreditExtensionType extensionType;

    /** Only populated for AMOUNT_EXTENSION — extra headroom in ₹ above the credit limit. */
    @Column(name = "extension_amount")
    private BigDecimal extensionAmount;

    /** Mandatory — extensions always expire (Business Rule 58). */
    @Column(name = "expiry_date", nullable = false)
    private LocalDate expiryDate;

    @Column(name = "granted_by_user_id", nullable = false)
    private Long grantedByUserId;

    /** Mandatory written justification for audit compliance. */
    @Column(name = "reason", nullable = false)
    private String reason;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private CreditExtensionStatus status = CreditExtensionStatus.ACTIVE;

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
