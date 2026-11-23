package com.ppms.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long>, JpaSpecificationExecutor<AuditLog> {

    /** Unbounded — kept for internal/reporting use only. */
    List<AuditLog> findByPumpIdOrderByCreatedAtDesc(Long pumpId);

    /** Everyone who has an audit event at the pump, as [actorId, actorName] rows, by name. */
    @Query("""
            SELECT a.actorId, MAX(a.actorName) FROM AuditLog a
            WHERE a.pumpId = :pumpId AND a.actorId IS NOT NULL
            GROUP BY a.actorId
            ORDER BY MAX(a.actorName)
            """)
    List<Object[]> findActors(@Param("pumpId") Long pumpId);
}
