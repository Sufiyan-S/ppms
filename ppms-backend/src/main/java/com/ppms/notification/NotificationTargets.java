package com.ppms.notification;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Decides which page a notification opens, from its type and the shift id kept in its dedup key. */
public final class NotificationTargets {

    private static final Pattern SHIFT_ID = Pattern.compile(":shift:(\\d+)");

    private NotificationTargets() {
    }

    public static NotificationTarget targetOf(NotificationType type, String dedupKey) {
        return switch (type) {
            case SETTLEMENT_REMINDER -> NotificationTarget.of("/dashboard/settlements");
            case LOW_STOCK -> NotificationTarget.of("/dashboard/inventory");
            case PRICE_STALE -> NotificationTarget.of("/dashboard/setup", "section", "prices");
            case CALIBRATION_DUE, CALIBRATION_DUE_SOON -> NotificationTarget.of("/dashboard/calibration");
            case DOCUMENT_EXPIRING -> NotificationTarget.of("/dashboard/documents");
            case ANCILLARY_LOW_STOCK -> NotificationTarget.of("/dashboard/ancillary");
            case SHIFT_OVERDUE, ZERO_SALE_SHIFT, AUTO_CLOSED_SHIFT, PRICE_CHANGE_OPEN_SHIFT -> shiftTarget(dedupKey);
        };
    }

    private static NotificationTarget shiftTarget(String dedupKey) {
        Matcher matcher = SHIFT_ID.matcher(dedupKey == null ? "" : dedupKey);
        return matcher.find()
                ? NotificationTarget.of("/dashboard/shifts", "shift", matcher.group(1))
                : NotificationTarget.of("/dashboard/shifts");
    }
}
