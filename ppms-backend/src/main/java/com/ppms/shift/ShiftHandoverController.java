package com.ppms.shift;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.dto.PagedResponse;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
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
 * A handover is a formal record created when an outgoing operator hands their
 * open shift to an incoming operator without closing the shift first.
 * It captures whether cash and meter readings were physically verified at the time.
 *
 * GET  /api/pumps/{pumpId}/handovers     — list all handovers for a pump
 * POST /api/pumps/{pumpId}/handovers     — record a new handover
 *
 * Business rules enforced here:
 * - The outgoing shift must be currently OPEN
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

        PageRequest pageable = PageRequest.of(page, Math.min(size, 200));
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
     * Records a shift handover.
     *
     * The outgoing shift must be OPEN. Once the handover is recorded, the outgoing
     * operator's responsibility for the shift is documented. The shift itself remains
     * open — the incoming operator will close it later with their own meter readings.
     *
     * Business validation + save are handled in ShiftHandoverService under @Transactional
     * to prevent a TOCTOU race where two concurrent requests both pass the "one handover
     * per shift" guard and create duplicate records.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ResponseEntity<HandoverResponse> createHandover(
            @PathVariable Long pumpId,
            @Valid @RequestBody CreateHandoverRequest request,
            @AuthenticationPrincipal User currentUser) {

        ShiftHandover saved = handoverService.createHandover(pumpId, request);

        log.info("Shift handover recorded: pump={} shift={} outgoing={} incoming={} cashVerified={} meterVerified={}",
                pumpId, saved.getOutgoingShiftId(), saved.getOutgoingOperatorId(),
                saved.getIncomingOperatorId(), saved.isPhysicalCashVerified(), saved.isMeterReadingsVerified());

        Map<Long, String> nameById = userRepository
                .findAllById(java.util.List.of(saved.getIncomingOperatorId(), saved.getOutgoingOperatorId()))
                .stream().collect(Collectors.toMap(User::getId, User::getFullName));
        String incomingName = nameById.getOrDefault(saved.getIncomingOperatorId(), "Unknown");
        String outgoingName  = nameById.getOrDefault(saved.getOutgoingOperatorId(),  "Unknown");

        auditService.log(pumpId, AuditAction.HANDOVER_COMPLETED,
                "ShiftHandover", saved.getId().toString(),
                "Handover: shift #" + saved.getOutgoingShiftId() +
                " → operator " + incomingName +
                " (cashVerified=" + saved.isPhysicalCashVerified() +
                ", meterVerified=" + saved.isMeterReadingsVerified() + ")",
                currentUser);

        return ResponseEntity.status(HttpStatus.CREATED).body(
                HandoverResponse.builder()
                        .id(saved.getId())
                        .pumpId(saved.getPumpId())
                        .outgoingShiftId(saved.getOutgoingShiftId())
                        .outgoingOperatorId(saved.getOutgoingOperatorId())
                        .outgoingOperatorName(outgoingName)
                        .incomingOperatorId(saved.getIncomingOperatorId())
                        .incomingOperatorName(incomingName)
                        .physicalCashVerified(saved.isPhysicalCashVerified())
                        .meterReadingsVerified(saved.isMeterReadingsVerified())
                        .notes(saved.getNotes())
                        .handoverTime(saved.getHandoverTime())
                        .createdAt(saved.getCreatedAt())
                        .build());
    }

    private HandoverResponse toResponse(ShiftHandover h, Map<Long, String> nameById) {
        return HandoverResponse.builder()
                .id(h.getId())
                .pumpId(h.getPumpId())
                .outgoingShiftId(h.getOutgoingShiftId())
                .outgoingOperatorId(h.getOutgoingOperatorId())
                .outgoingOperatorName(nameById.getOrDefault(h.getOutgoingOperatorId(), "Unknown"))
                .incomingOperatorId(h.getIncomingOperatorId())
                .incomingOperatorName(nameById.getOrDefault(h.getIncomingOperatorId(), "Unknown"))
                .physicalCashVerified(h.isPhysicalCashVerified())
                .meterReadingsVerified(h.isMeterReadingsVerified())
                .notes(h.getNotes())
                .handoverTime(h.getHandoverTime())
                .createdAt(h.getCreatedAt())
                .build();
    }
}
