package com.ppms.pump;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class SetupChecklistController {

    private final SetupChecklistService setupChecklistService;

    /**
     * GET /api/pumps/{pumpId}/setup-checklist
     * Each setup step of the pump with whether it is done, and how many of the required steps are done.
     */
    @GetMapping("/{pumpId}/setup-checklist")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public SetupChecklistResponse getChecklist(@PathVariable Long pumpId) {
        return setupChecklistService.getChecklist(pumpId);
    }
}
