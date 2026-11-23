package com.ppms.shift;

import com.ppms.common.dto.PageRequests;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.dto.PagedResponse;
import com.ppms.common.idempotency.IdempotencyService;
import com.ppms.common.idempotency.IdempotentRequest;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * REST controller for shift handover records.
 *
 * A handover closes the outgoing operator's shift and opens a new one for the incoming operator.
 * It captures whether cash and meter readings were physically verified at the time.
 *
 * GET  /api/pumps/{pumpId}/handovers     — list all handovers for a pump
 * POST /api/pumps/{pumpId}/handovers     — hand a shift over
 *
 * Business rules enforced here:
 * - The outgoing shift must be currently OPEN and inside its scheduled window
 * - A handover cannot already exist for the same outgoing shift (1-to-1)
 * - The incoming operator must not already have an open shift
 * - The incoming operator must be different from the outgoing operator
 */
@Slf4j
@RestController
@RequestMapping("/api/pumps/{pumpId}/handovers")
@RequiredArgsConstructor
public class ShiftHandoverController {

    private final ShiftHandoverRepository handoverRepository;
    private final ShiftHandoverService handoverService;
    private final ShiftRepository shiftRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;
    private final IdempotencyService idempotencyService;

    /**
     * GET /api/pumps/{pumpId}/handovers?page=0&size=50
     * Returns paginated handover records for a pump, newest first.
     * Max page size is capped at 200 to prevent runaway queries.
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<PagedResponse<HandoverResponse>> getHandovers(
            @PathVariable Long pumpId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        var pageable = PageRequests.of(page, size);
        Page<ShiftHandover> handoverPage = handoverRepository.findByPumpIdOrderByHandoverTimeDesc(pumpId, pageable);

        List<ShiftHandover> handovers = handoverPage.getContent();

        // Batch-load operator names to avoid N+1
        Set<Long> userIds = handovers.stream()
                .flatMap(h -> java.util.stream.Stream.of(h.getOutgoingOperatorId(), h.getIncomingOperatorId()))
                .collect(Collectors.toSet());
        Map<Long, String> nameById = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));

        Page<HandoverResponse> responsePage = handoverPage.map(h -> toResponse(h, nameById));

        return ResponseEntity.ok(PagedResponse.of(responsePage));
    }

    /**
     * POST /api/pumps/{pumpId}/handovers
     * Hands an OPEN shift to another operator: the outgoing shift is closed with the readings and payments in
     * {@code closing} (same rules as a normal close), and a new shift opens for the incoming operator on the same
     * nozzles and shift window from those readings. Closing takes manager rights, so operators cannot hand over.
     * An Idempotency-Key header makes a resend after a timeout return the first result instead of handing over twice.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<?> createHandover(
            @PathVariable Long pumpId,
            @Valid @RequestBody CreateHandoverRequest request,
            @RequestHeader(value = IdempotencyService.HEADER, required = false) String idempotencyKey,
            HttpServletRequest httpRequest,
            @AuthenticationPrincipal User currentUser) {
        return idempotencyService.runOnce(
                IdempotentRequest.of(currentUser.getId(), idempotencyKey, httpRequest, request),
                () -> handOver(pumpId, request, currentUser));
    }

    private ResponseEntity<HandoverResponse> handOver(Long pumpId, CreateHandoverRequest request, User currentUser) {
        ShiftHandoverService.HandoverResult result = handoverService.createHandover(pumpId, request, currentUser);
        ShiftHandover saved = result.handover();
        ShiftResponse closedShift = result.closedShift();

        log.info("Shift handover recorded: pump={} shift={} outgoing={} incoming={} newShift={} cashVerified={} meterVerified={}",
                pumpId, saved.getOutgoingShiftId(), saved.getOutgoingOperatorId(), saved.getIncomingOperatorId(),
                saved.getIncomingShiftId(), saved.isPhysicalCashVerified(), saved.isMeterReadingsVerified());

        Map<Long, String> nameById = userRepository
                .findAllById(java.util.List.of(saved.getIncomingOperatorId(), saved.getOutgoingOperatorId()))
                .stream().collect(Collectors.toMap(User::getId, User::getFullName));

        auditService.log(pumpId, AuditAction.SHIFT_CLOSED,
                "Shift", closedShift.getId().toString(),
                "Shift closed at handover: status=" + closedShift.getStatus() +
                " totalAmountDue=₹" + closedShift.getTotalAmountDue(),
                currentUser);
        auditService.log(pumpId, AuditAction.HANDOVER_COMPLETED,
                "ShiftHandover", saved.getId().toString(),
                "Handover: shift #" + saved.getOutgoingShiftId() +
                " → operator " + nameById.getOrDefault(saved.getIncomingOperatorId(), "Unknown") +
                " on new shift #" + saved.getIncomingShiftId() +
                " (cashVerified=" + saved.isPhysicalCashVerified() +
                ", meterVerified=" + saved.isMeterReadingsVerified() + ")",
                currentUser);

        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(saved, nameById, closedShift.getStatus()));
    }

    private HandoverResponse toResponse(ShiftHandover h, Map<Long, String> nameById) {
        return toResponse(h, nameById, null);
    }

    private HandoverResponse toResponse(ShiftHandover h, Map<Long, String> nameById, String outgoingShiftStatus) {
        return HandoverResponse.builder()
                .id(h.getId())
                .pumpId(h.getPumpId())
                .outgoingShiftId(h.getOutgoingShiftId())
                .outgoingOperatorId(h.getOutgoingOperatorId())
                .outgoingOperatorName(nameById.getOrDefault(h.getOutgoingOperatorId(), "Unknown"))
                .incomingOperatorId(h.getIncomingOperatorId())
                .incomingOperatorName(nameById.getOrDefault(h.getIncomingOperatorId(), "Unknown"))
                .incomingShiftId(h.getIncomingShiftId())
                .outgoingShiftStatus(outgoingShiftStatus)
                .physicalCashVerified(h.isPhysicalCashVerified())
                .meterReadingsVerified(h.isMeterReadingsVerified())
                .notes(h.getNotes())
                .handoverTime(h.getHandoverTime())
                .createdAt(h.getCreatedAt())
                .build();
    }
}
