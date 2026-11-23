package com.ppms.notification;

import com.ppms.user.UserRole;

import java.util.EnumSet;
import java.util.Set;

/**
 * Which notification types each role receives.
 *
 * Owners, admins and managers run the pump and receive every alert. Operators and accountants only receive
 * stock alerts: the other types are shift-integrity or management alerts (zero-sale and force-closed shifts,
 * overdue shifts, prices, calibration, documents, settlements) that they cannot act on, and some of them are
 * about the operator who would otherwise be able to see and dismiss them.
 */
public final class NotificationAudience {

    private static final Set<NotificationType> STOCK_ALERTS =
            EnumSet.of(NotificationType.LOW_STOCK, NotificationType.ANCILLARY_LOW_STOCK);

    private NotificationAudience() {
    }

    public static Set<NotificationType> typesVisibleTo(UserRole role) {
        return switch (role) {
            case OPERATOR, ACCOUNTANT -> STOCK_ALERTS;
            default -> EnumSet.allOf(NotificationType.class);
        };
    }
}
