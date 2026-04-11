package com.ppms.planning;

import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class ShiftPlanController {

    private final ShiftPlanningService planningService;
    private final UserRepository userRepository;
    private final ShiftRepository shiftRepository;

    // ── Staff preferences ──────────────────────────────────────────────────────

    @PutMapping("/{pumpId}/staff/{userId}/preferences")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public StaffPreference setPreference(
            @PathVariable Long pumpId,
            @PathVariable Long userId,
            @RequestBody SetPreferenceRequest req) {
        return planningService.setPreference(pumpId, userId, req);
    }

    @GetMapping("/{pumpId}/staff/{userId}/preferences")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public StaffPreference getPreference(
            @PathVariable Long pumpId,
            @PathVariable Long userId) {
        return planningService.getPreference(userId)
                .orElseGet(() -> StaffPreference.builder()
                        .userId(userId)
                        .pumpId(pumpId)
                        .build());
    }

    // ── Staff leave ────────────────────────────────────────────────────────────

    @PostMapping("/{pumpId}/staff/{userId}/leaves")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public StaffLeave addLeave(
            @PathVariable Long pumpId,
            @PathVariable Long userId,
            @Valid @RequestBody AddLeaveRequest req) {
        return planningService.addLeave(pumpId, userId, req);
    }

    @DeleteMapping("/{pumpId}/staff/{userId}/leaves/{leaveId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public void removeLeave(
            @PathVariable Long pumpId,
            @PathVariable Long userId,
            @PathVariable Long leaveId) {
        planningService.removeLeave(leaveId, pumpId);
    }

    @GetMapping("/{pumpId}/staff/{userId}/leaves")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public List<StaffLeave> getLeaves(
            @PathVariable Long pumpId,
            @PathVariable Long userId) {
        return planningService.getLeaves(userId);
    }

    // ── Shift plans ────────────────────────────────────────────────────────────

    @PostMapping("/{pumpId}/shift-plans/generate")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ShiftPlan generatePlan(
            @PathVariable Long pumpId,
            @Valid @RequestBody GeneratePlanRequest req,
            @AuthenticationPrincipal User currentUser) {
        return planningService.generatePlan(pumpId, req, currentUser.getId());
    }

    @GetMapping("/{pumpId}/shift-plans")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR')")
    public ShiftPlan getPlan(
            @PathVariable Long pumpId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart) {
        return planningService.getPlan(pumpId, weekStart)
                .orElseThrow(() -> new com.ppms.common.exception.ResourceNotFoundException(
                        "No plan found for week " + weekStart));
    }

    @GetMapping("/{pumpId}/shift-plans/{planId}/entries")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR')")
    public List<ShiftPlanEntry> getEntries(
            @PathVariable Long pumpId,
            @PathVariable Long planId) {
        return planningService.getEntries(planId);
    }

    @PostMapping("/{pumpId}/shift-plans/{planId}/entries")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ShiftPlanEntry addEntry(
            @PathVariable Long pumpId,
            @PathVariable Long planId,
            @Valid @RequestBody AddEntryRequest req) {
        return planningService.addEntry(planId, req);
    }

    @PatchMapping("/{pumpId}/shift-plans/{planId}/entries/{entryId}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ShiftPlanEntry updateEntry(
            @PathVariable Long pumpId,
            @PathVariable Long planId,
            @PathVariable Long entryId,
            @Valid @RequestBody UpdateEntryRequest req) {
        return planningService.updateEntry(planId, entryId, req);
    }

    @DeleteMapping("/{pumpId}/shift-plans/{planId}/entries/{entryId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public void removeEntry(
            @PathVariable Long pumpId,
            @PathVariable Long planId,
            @PathVariable Long entryId) {
        planningService.removeEntry(planId, entryId);
    }

    @PostMapping("/{pumpId}/shift-plans/{planId}/publish")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ShiftPlan publishPlan(
            @PathVariable Long pumpId,
            @PathVariable Long planId) {
        return planningService.publishPlan(planId);
    }

    /** Staff member's own upcoming shifts (read-only). Accessible by all pump staff. */
    @GetMapping("/{pumpId}/shift-plans/my-schedule")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR')")
    public List<ShiftPlanEntry> mySchedule(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        return planningService.getUpcomingForOperator(currentUser.getId());
    }

    /**
     * Planned operators for a specific date+window — used to pre-fill shift opening.
     * Manager needs this to open shifts.
     */
    @GetMapping("/{pumpId}/shift-plans/planned-operators")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public List<ShiftPlanEntry> plannedOperators(
            @PathVariable Long pumpId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam Long shiftDefinitionId) {
        return planningService.getPlannedForSlot(pumpId, date, shiftDefinitionId);
    }

    /**
     * Actual operator attendance for past dates, derived from real closed Shift records.
     * Returns one entry per distinct (shiftDate, shiftWindow, operator) combination.
     */
    @GetMapping("/{pumpId}/shift-plans/actual-attendance")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public List<ActualSlotDto> actualAttendance(
            @PathVariable Long pumpId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return shiftRepository.findClosedShiftsByDateRange(pumpId, from, to)
                .stream()
                .map(s -> new ActualSlotDto(s.getShiftDate(), s.getShiftDefinitionId(), s.getOperatorId()))
                .distinct()
                .collect(Collectors.toList());
    }
}
