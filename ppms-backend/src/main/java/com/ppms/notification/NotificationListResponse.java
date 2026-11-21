package com.ppms.notification;

import java.util.List;

/** The newest unread notifications shown in the bell, plus the true unread count beyond that page. */
public record NotificationListResponse(List<Notification> notifications, long unreadCount) {
}
