package com.ppms.attention;

import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class AttentionController {

    private final AttentionService attentionService;

    /** GET /api/pumps/{pumpId}/attention — what needs acting on today at this pump, most urgent first. */
    @GetMapping("/api/pumps/{pumpId}/attention")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'ACCOUNTANT')")
    public ResponseEntity<List<AttentionItem>> getPumpAttention(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(attentionService.itemsForPump(pumpId, currentUser));
    }

    /** GET /api/pumps/attention — the same across every pump the user can open. */
    @GetMapping("/api/pumps/attention")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'ACCOUNTANT')")
    public ResponseEntity<List<AttentionItem>> getMyPumpsAttention(@AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(attentionService.itemsForMyPumps(currentUser));
    }
}
