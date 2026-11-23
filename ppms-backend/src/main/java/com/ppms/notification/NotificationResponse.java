package com.ppms.notification;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * A notification as the signed-in user sees it: whether they have read it, and the page it opens.
 * code and params let the screen show title and message in the user's language (enums.json notifications.&lt;code&gt;);
 * both are null on notifications stored before their values were kept, which show the English title and message.
 */
public record NotificationResponse(
        Long id,
        Long pumpId,
        NotificationType type,
        String title,
        String message,
        OffsetDateTime createdAt,
        boolean read,
        NotificationTarget target,
        String code,
        Map<String, Object> params
) {

    private static final String EXPIRED_DOCUMENT_KEY_SUFFIX = ":EXPIRED";

    static NotificationResponse of(Notification notification, boolean read) {
        Map<String, Object> params = notification.getParams();
        return new NotificationResponse(notification.getId(), notification.getPumpId(), notification.getType(),
                notification.getTitle(), notification.getMessage(), notification.getCreatedAt(), read,
                NotificationTargets.targetOf(notification.getType(), notification.getDedupKey()),
                params == null ? null : messageCode(notification.getType(), notification.getDedupKey()),
                params);
    }

    private static String messageCode(NotificationType type, String dedupKey) {
        if (type == NotificationType.DOCUMENT_EXPIRING && dedupKey.endsWith(EXPIRED_DOCUMENT_KEY_SUFFIX)) {
            return "DOCUMENT_EXPIRED";
        }
        return type.name();
    }
}
