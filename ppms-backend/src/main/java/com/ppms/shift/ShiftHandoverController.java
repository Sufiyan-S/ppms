package com.ppms.shift;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
    private final ShiftRepository shiftRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;

    /**
     * GET /api/pumps/{pumpId}/handovers
     * Returns all handover records for a pump, newest first.
     */
    @GetMapping
    public ResponseEntity<List<HandoverResponse>> getHandovers(@PathVariable Long pumpId) {
        List<ShiftHandover> handovers = handoverRepository.findByPumpIdOrderByHandoverTimeDesc(pumpId);

        // Batch-load operator names to avoid N+1
        Set<Long> userIds = handovers.stream()
                .flatMap(h -> java.util.stream.Stream.of(h.getOutgoingOperatorId(), h.getIncomingOperatorId()))
                .collect(Collectors.toSet());
        Map<Long, String> nameById = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));

        List<HandoverResponse> response = handovers.stream()
                .map(h -> toResponse(h, nameById))
                .toList();

        return ResponseEntity.ok(response);
    }

    /**
     * POST /api/pumps/{pumpId}/handovers
     * Records a shift handover.
     *
     * The outgoing shift must be OPEN. Once the handover is recorded, the outgoing
     * operator's responsibility for the shift is documented. The shift itself remains
     * open — the incoming operator will close it later with their own meter readings.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ResponseEntity<HandoverResponse> createHandover(
            @PathVariable Long pumpId,
            @Valid @RequestBody CreateHandoverRequest request,
            @AuthenticationPrincipal User currentUser) {

        // Validate the outgoing shift exists and is open
        Shift outgoingShift = shiftRepository.findById(request.outgoingShiftId())
                .orElseThrow(() -> new ResourceNotFoundException("Shift not found"));

        if (!outgoingShift.getPumpId().equals(pumpId)) {
            throw new BusinessException("Shift does not belong to this pump");
        }

        if (outgoingShift.getStatus() != ShiftStatus.OPEN
                && outgoingShift.getStatus() != ShiftStatus.OPEN_OVERDUE) {
            throw new BusinessException(
                    "Handover can only be created for an OPEN shift. Current status: " + outgoingShift.getStatus());
        }

        // One handover per shift — prevents accidental duplicate handover records
        handoverRepository.findByOutgoingShiftId(request.outgoingShiftId()).ifPresent(existing -> {
            throw new BusinessException(
                    "A handover already exists for shift #" + request.outgoingShiftId() +
                    " (handover ID: " + existing.getId() + ")");
        });

        // Validate incoming operator exists
        User incomingOperator = userRepository.findById(request.incomingOperatorId())
                .orElseThrow(() -> new ResourceNotFoundException("Incoming operator not found"));

        // Incoming and outgoing must be different people
        if (outgoingShift.getOperatorId().equals(request.incomingOperatorId())) {
            throw new BusinessException("Incoming and outgoing operators cannot be the same person");
        }

        // Incoming operator must not already have an open shift
        shiftRepository.findOpenShiftByOperator(request.incomingOperatorId()).ifPresent(existing -> {
            throw new BusinessException(
                    incomingOperator.getFullName() + " already has an open shift (ID " + existing.getId() +
                    "). They must close it before taking a handover.");
        });

        ShiftHandover handover = ShiftHandover.builder()
                .pumpId(pumpId)
                .outgoingShiftId(request.outgoingShiftId())
                .outgoingOperatorId(outgoingShift.getOperatorId())
                .incomingOperatorId(request.incomingOperatorId())
                .physicalCashVerified(request.physicalCashVerified())
                .meterReadingsVerified(request.meterReadingsVerified())
                .notes(request.notes())
                .build();

        ShiftHandover saved = handoverRepository.save(handover);

        log.info("Shift handover recorded: pump={} shift={} outgoing={} incoming={} cashVerified={} meterVerified={}",
                pumpId, request.outgoingShiftId(), outgoingShift.getOperatorId(),
                request.incomingOperatorId(), request.physicalCashVerified(), request.meterReadingsVerified());

        auditService.log(pumpId, AuditAction.HANDOVER_COMPLETED,
                "ShiftHandover", saved.getId().toString(),
                "Handover: shift #" + request.outgoingShiftId() +
                " → operator " + incomingOperator.getFullName() +
                " (cashVerified=" + request.physicalCashVerified() +
                ", meterVerified=" + request.meterReadingsVerified() + ")",
                currentUser);

        // Resolve user names for the response
        User outgoingOperator = userRepository.findById(outgoingShift.getOperatorId())
                .orElse(null);
        String outgoingName = outgoingOperator != null ? outgoingOperator.getFullName() : "Unknown";

        return ResponseEntity.status(HttpStatus.CREATED).body(
                HandoverResponse.builder()
                        .id(saved.getId())
                        .pumpId(saved.getPumpId())
                        .outgoingShiftId(saved.getOutgoingShiftId())
                        .outgoingOperatorId(saved.getOutgoingOperatorId())
                        .outgoingOperatorName(outgoingName)
                        .incomingOperatorId(saved.getIncomingOperatorId())
                        .incomingOperatorName(incomingOperator.getFullName())
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
