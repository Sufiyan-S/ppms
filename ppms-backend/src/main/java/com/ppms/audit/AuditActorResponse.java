package com.ppms.audit;

/** Someone who appears in a pump's audit log. */
public record AuditActorResponse(Long actorId, String actorName) {
}
