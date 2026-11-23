package com.ppms.approval;

import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/pumps/{pumpId}/approvals")
@RequiredArgsConstructor
public class ApprovalQueueController {

    private final ApprovalQueueService approvalQueueService;

    /** GET /api/pumps/{pumpId}/approvals — pending expenses and credit payments, oldest first. */
    @GetMapping
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<List<ApprovalItemResponse>> getPendingItems(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(approvalQueueService.pendingItems(pumpId, currentUser));
    }

    /**
     * POST /api/pumps/{pumpId}/approvals/decisions
     * Approves or rejects several items; each is checked and audited like a single approval and reported on its own.
     */
    @PostMapping("/decisions")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<ApprovalDecisionResult> decide(
            @PathVariable Long pumpId,
            @Valid @RequestBody ApprovalDecisionRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(approvalQueueService.decide(pumpId, request, currentUser));
    }
}
