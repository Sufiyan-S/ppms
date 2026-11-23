package com.ppms.notification;

import com.ppms.common.dto.PageRequests;
import com.ppms.common.dto.PagedResponse;
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
     * Returns the newest 100 notifications the signed-in user has not read, of the types their role
     * receives, and their total unread count.
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
        return notificationService.getUnreadNotifications(pumpId, currentUser);
    }

    /**
     * GET /api/pumps/{pumpId}/notifications/history?page=0&size=20[&type=LOW_STOCK]
     * Every notification of the types the user's role receives, read and unread, newest first, each with this
     * user's read state and the page it opens.
     */
    @GetMapping("/{pumpId}/notifications/history")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT')")
    public PagedResponse<NotificationResponse> getHistory(
            @PathVariable Long pumpId,
            @RequestParam(required = false) NotificationType type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal User currentUser) {
        return notificationService.getHistory(pumpId, type, PageRequests.of(page, size), currentUser);
    }

    /**
     * POST /api/pumps/{pumpId}/notifications/mark-read
     * Marks the notifications the user was shown as read for that user only; anything beyond the shown page
     * stays unread, and other users of the pump are not affected.
     */
    @PostMapping("/{pumpId}/notifications/mark-read")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT')")
    public Map<String, Object> markRead(
            @PathVariable Long pumpId,
            @Valid @RequestBody MarkNotificationsReadRequest request,
            @AuthenticationPrincipal User currentUser) {
        int marked = notificationService.markRead(pumpId, request.getIds(), currentUser);
        return Map.of("success", true, "marked", marked);
    }
}
