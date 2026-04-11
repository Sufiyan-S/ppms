package com.ppms.audit;

import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Writes a single append-only row to audit_logs.
 * Inject this service into any controller or service that performs a sensitive operation.
 *
 * Example usage:
 *   auditService.log(pumpId, AuditAction.PRICE_UPDATED, "FuelPrice", priceId.toString(),
 *                    "Fuel price updated to ₹" + newPrice, currentUser);
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    /**
     * Records an audit event.
     *
     * @param pumpId      The pump this event belongs to.
     * @param action      The type of action (from AuditAction enum).
     * @param entityType  The domain entity involved (e.g., "FuelPrice", "User", "Shift").
     * @param entityId    The ID of the entity, as a string. Null is acceptable.
     * @param description Human-readable description of the change.
     * @param actor       The authenticated user who performed the action.
     */
    public void log(Long pumpId, AuditAction action, String entityType,
                    String entityId, String description, User actor) {
        log(pumpId, action, entityType, entityId, description, actor.getId(), actor.getFullName());
    }

    /**
     * Overload for auth events (LOGIN_FAILED) where no authenticated User object is available.
     * pumpId may be null for system-level events not tied to a specific pump.
     */
    public void log(Long pumpId, AuditAction action, String entityType,
                    String entityId, String description, Long actorId, String actorName) {
        AuditLog entry = AuditLog.builder()
                .pumpId(pumpId)
                .action(action)
                .entityType(entityType)
                .entityId(entityId)
                .description(description)
                .actorId(actorId)
                .actorName(actorName)
                .build();
        auditLogRepository.save(entry);
        log.info("AUDIT pump={} action={} entity={}/{} actor={} — {}",
                pumpId, action, entityType, entityId, actorId, description);
    }
}
