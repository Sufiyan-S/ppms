package com.ppms.audit;

import com.ppms.common.time.BusinessClock;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
public class AuditLogController {
    private final AuditLogRepository auditLogRepository;
    private final BusinessClock businessClock;

    /**
     * GET /api/pumps/{pumpId}/audit-logs?page=0&size=10&sort=createdAt,desc&from=2026-04-01&to=2026-04-04
     *     [&action=SHIFT_CLOSED][&actorId=6][&hideSignIns=true]
     * Returns a paginated list of audit log entries for a pump, newest first.
     * Optional filters: from (inclusive), to (inclusive, end of day), one action, one actor, and hideSignIns to
     * leave out sign-in events. Restricted to Owner and Admin only.
     */
    @GetMapping("/{pumpId}/audit-logs")
    public Page<AuditLog> getAuditLogs(
            @PathVariable Long pumpId,
            @PageableDefault(size = 10, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) AuditAction action,
            @RequestParam(required = false) Long actorId,
            @RequestParam(defaultValue = "false") boolean hideSignIns) {
        AuditLogFilter filter = new AuditLogFilter(pumpId,
                from != null ? startOfBusinessDay(from) : null,
                to != null ? startOfBusinessDay(to.plusDays(1)) : null,
                action, actorId, hideSignIns);
        return auditLogRepository.findAll(filter.toSpecification(), pageable);
    }

    /**
     * GET /api/pumps/{pumpId}/audit-logs/actors
     * Everyone who has an audit event at the pump, for the "by user" filter.
     */
    @GetMapping("/{pumpId}/audit-logs/actors")
    public List<AuditActorResponse> getActors(@PathVariable Long pumpId) {
        return auditLogRepository.findActors(pumpId).stream()
                .map(row -> new AuditActorResponse((Long) row[0], (String) row[1]))
                .toList();
    }

    private OffsetDateTime startOfBusinessDay(LocalDate date) {
        return businessClock.startOfDay(date);
    }
}
