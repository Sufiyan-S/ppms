package com.ppms.notification;

import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    /**
     * GET /api/pumps/{pumpId}/notifications
     * Returns all unread notifications for the pump.
     *
     * Notifications are generated in the background by NotificationGenerationJob
     * every 5 minutes — this endpoint only reads pre-computed results from the DB.
     * This avoids running expensive state checks (tank levels, document expiry, etc.)
     * on every API poll and makes the response fast and predictable.
     */
    @GetMapping("/{pumpId}/notifications")
    public List<Notification> getNotifications(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        return notificationService.getUnreadNotifications(pumpId);
    }

    /**
     * POST /api/pumps/{pumpId}/notifications/mark-all-read
     * Marks all unread notifications as read (clears the bell badge).
     */
    @PostMapping("/{pumpId}/notifications/mark-all-read")
    public Map<String, Object> markAllRead(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        notificationService.markAllRead(pumpId);
        return Map.of("success", true);
    }
}
