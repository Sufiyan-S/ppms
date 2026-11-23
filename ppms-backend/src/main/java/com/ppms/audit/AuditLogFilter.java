package com.ppms.audit;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Optional audit log filters; any left null are not applied. {@code hideSignIns} leaves out LOGIN events,
 * which otherwise crowd out everything else on a busy pump.
 */
public record AuditLogFilter(
        Long pumpId,
        OffsetDateTime from,
        OffsetDateTime toExclusive,
        AuditAction action,
        Long actorId,
        boolean hideSignIns
) {

    Specification<AuditLog> toSpecification() {
        return (root, query, builder) -> {
            List<Predicate> conditions = new ArrayList<>();
            conditions.add(builder.equal(root.get("pumpId"), pumpId));
            if (from != null) {
                conditions.add(builder.greaterThanOrEqualTo(root.get("createdAt"), from));
            }
            if (toExclusive != null) {
                conditions.add(builder.lessThan(root.get("createdAt"), toExclusive));
            }
            if (action != null) {
                conditions.add(builder.equal(root.get("action"), action));
            }
            if (actorId != null) {
                conditions.add(builder.equal(root.get("actorId"), actorId));
            }
            if (hideSignIns) {
                conditions.add(builder.notEqual(root.get("action"), AuditAction.LOGIN));
            }
            return builder.and(conditions.toArray(Predicate[]::new));
        };
    }
}
