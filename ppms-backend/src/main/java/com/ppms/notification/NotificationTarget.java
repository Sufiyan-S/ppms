package com.ppms.notification;

import java.util.Map;

/** The page a notification opens: an app route plus the query parameters that select what it is about. */
public record NotificationTarget(String route, Map<String, String> params) {

    static NotificationTarget of(String route) {
        return new NotificationTarget(route, Map.of());
    }

    static NotificationTarget of(String route, String paramName, String paramValue) {
        return new NotificationTarget(route, Map.of(paramName, paramValue));
    }
}
