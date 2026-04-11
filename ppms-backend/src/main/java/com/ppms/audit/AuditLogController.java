package com.ppms.audit;

import com.ppms.common.time.BusinessClock;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
public class AuditLogController {
    private final AuditLogRepository auditLogRepository;
    private final BusinessClock businessClock;

    /**
     * GET /api/pumps/{pumpId}/audit-logs?page=0&size=10&sort=createdAt,desc&from=2026-04-01&to=2026-04-04
     * Returns a paginated list of audit log entries for a pump, newest first.
     * Optional date filters: from (inclusive) and to (inclusive, end of day).
     * Restricted to Owner and Admin only.
     */
    @GetMapping("/{pumpId}/audit-logs")
    public Page<AuditLog> getAuditLogs(
            @PathVariable Long pumpId,
            @PageableDefault(size = 10, sort = "createdAt") Pageable pageable,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to) {

        if (from != null && to != null) {
            OffsetDateTime fromDt = startOfBusinessDay(from);
            OffsetDateTime toDt   = startOfBusinessDay(to.plusDays(1));
            return auditLogRepository
                    .findByPumpIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDesc(
                            pumpId, fromDt, toDt, pageable);
        }

        return auditLogRepository.findByPumpIdOrderByCreatedAtDesc(pumpId, pageable);
    }

    private OffsetDateTime startOfBusinessDay(LocalDate date) {
        return businessClock.startOfDay(date);
    }
}
