package com.ppms.notification;

import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    /**
     * GET /api/pumps/{pumpId}/notifications
     * Returns the newest 100 unread notifications for the pump and the total unread count.
     *
     * Notifications are generated in the background by NotificationGenerationJob
     * every 5 minutes — this endpoint only reads pre-computed results from the DB.
     * This avoids running expensive state checks (tank levels, document expiry, etc.)
     * on every API poll and makes the response fast and predictable.
     */
    @GetMapping("/{pumpId}/notifications")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT')")
    public NotificationListResponse getNotifications(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        return notificationService.getUnreadNotifications(pumpId);
    }

    /**
     * POST /api/pumps/{pumpId}/notifications/mark-read
     * Marks the notifications the user was shown as read; anything beyond the shown page stays unread.
     */
    @PostMapping("/{pumpId}/notifications/mark-read")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT')")
    public Map<String, Object> markRead(
            @PathVariable Long pumpId,
            @Valid @RequestBody MarkNotificationsReadRequest request,
            @AuthenticationPrincipal User currentUser) {
        int marked = notificationService.markRead(pumpId, request.getIds());
        return Map.of("success", true, "marked", marked);
    }
}
