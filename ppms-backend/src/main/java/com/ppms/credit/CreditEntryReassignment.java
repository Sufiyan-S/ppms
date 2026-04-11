package com.ppms.credit;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * Audit record of a credit entry being reassigned from one account to another
 * (e.g. from a parent account to one of its sub-accounts, or between siblings).
 *
 * Owner/Admin only. The reassignment changes shift_credit_entries.client_id
 * so that the outstanding balance is correctly attributed to the target account.
 * The original client_name on the credit entry is preserved for historical display.
 */
@Entity
@Table(name = "credit_entry_reassignments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreditEntryReassignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "credit_entry_id", nullable = false)
    private Long creditEntryId;

    @Column(name = "from_client_id", nullable = false)
    private Long fromClientId;

    @Column(name = "to_client_id", nullable = false)
    private Long toClientId;

    @Column(name = "reassigned_by_user_id", nullable = false)
    private Long reassignedByUserId;

    @Column(name = "reason", nullable = false)
    private String reason;

    @Column(name = "reassigned_at", nullable = false, updatable = false)
    private OffsetDateTime reassignedAt;

    @PrePersist
    protected void onCreate() {
        if (reassignedAt == null) {
            reassignedAt = OffsetDateTime.now(ZoneOffset.UTC);
        }
    }
}
