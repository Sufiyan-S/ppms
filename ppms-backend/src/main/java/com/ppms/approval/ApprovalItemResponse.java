package com.ppms.approval;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;

/**
 * One expense or credit payment waiting for an Owner or Admin.
 *
 * @param category        expense category; null for a credit payment
 * @param clientId        credit client paying; null for an expense
 * @param blockedReason   why the current user cannot decide this item; null when they can
 * @param blockedReasonCode names blockedReason for translated screens, filled with blockedReasonParams
 */
public record ApprovalItemResponse(
        ApprovalKind kind,
        Long id,
        BigDecimal amount,
        LocalDate itemDate,
        String submittedByName,
        OffsetDateTime submittedAt,
        String category,
        Long clientId,
        String clientName,
        String note,
        String blockedReason,
        String blockedReasonCode,
        Map<String, Object> blockedReasonParams
) {}
