package com.ppms.bank;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Metadata header for a bank statement import.
 * Each import represents one CSV file containing bank transactions for a period.
 * The matched_lines counter is updated as individual lines are reconciled.
 *
 * account_number is stored for display only — it is NOT used as a unique key
 * since the same account may have multiple statement imports for overlapping periods.
 */
@Entity
@Table(name = "bank_statement_imports")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BankStatementImport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "bank_name", nullable = false, length = 100)
    private String bankName;

    @Column(name = "account_number", length = 50)
    private String accountNumber;

    @Column(name = "statement_from_date", nullable = false)
    private LocalDate statementFromDate;

    @Column(name = "statement_to_date", nullable = false)
    private LocalDate statementToDate;

    @Column(name = "total_lines", nullable = false)
    private Integer totalLines;

    @Column(name = "matched_lines", nullable = false)
    private Integer matchedLines;

    @Column(name = "imported_by_user_id", nullable = false)
    private Long importedByUserId;

    @Column(name = "imported_at", nullable = false, updatable = false)
    private OffsetDateTime importedAt;

    @PrePersist
    protected void onCreate() {
        importedAt = OffsetDateTime.now();
        if (totalLines == null) totalLines = 0;
        if (matchedLines == null) matchedLines = 0;
    }
}
