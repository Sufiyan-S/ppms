package com.ppms.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    /** Unbounded — kept for internal/reporting use only. */
    List<AuditLog> findByPumpIdOrderByCreatedAtDesc(Long pumpId);

    /** Paginated — use this for the API to prevent loading thousands of log entries. */
    Page<AuditLog> findByPumpIdOrderByCreatedAtDesc(Long pumpId, Pageable pageable);

    /** Paginated with date range filter — from (inclusive) to to (exclusive). */
    Page<AuditLog> findByPumpIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDesc(
            Long pumpId, OffsetDateTime from, OffsetDateTime to, Pageable pageable);
}
