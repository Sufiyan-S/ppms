package com.ppms.pump;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
 * REST controller for pump closure (dry-day / holiday / maintenance) management.
 *
 * GET    /api/pumps/{pumpId}/closures          — list all recorded closures
 * POST   /api/pumps/{pumpId}/closures          — mark a date as closed
 * DELETE /api/pumps/{pumpId}/closures/{id}     — remove a closure (re-opens the day)
 *
 * When a closure exists for today, ShiftService.openShift() blocks any new shift
 * with a clear error message referencing the closure reason.
 *
 * Only OWNER can add or remove closures.
 */
@Slf4j
@RestController
@RequestMapping("/api/pumps/{pumpId}/closures")
@RequiredArgsConstructor
public class PumpClosureController {

    private final PumpClosureRepository closureRepository;
    private final PumpLocationRepository pumpLocationRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;

    /**
     * GET /api/pumps/{pumpId}/closures
     * Returns all closure records for the pump, newest-date first.
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR')")
    public ResponseEntity<List<PumpClosureResponse>> getClosures(@PathVariable Long pumpId) {
        List<PumpClosure> closures = closureRepository.findByPumpIdOrderByClosureDateDesc(pumpId);

        // Batch-load user names to avoid N+1 per closure record
        Set<Long> userIds = closures.stream().map(PumpClosure::getCreatedByUserId).collect(Collectors.toSet());
        Map<Long, String> nameById = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));

        List<PumpClosureResponse> response = closures.stream()
                .map(c -> toResponse(c, nameById.getOrDefault(c.getCreatedByUserId(), "Unknown")))
                .toList();

        return ResponseEntity.ok(response);
    }

    /**
     * POST /api/pumps/{pumpId}/closures
     * Marks a date as a pump closure. The date must be today or in the future.
     * Attempting to create a duplicate for the same date returns 400 — the DB
     * unique constraint would catch it anyway, but we surface a cleaner message.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ResponseEntity<PumpClosureResponse> createClosure(
            @PathVariable Long pumpId,
            @Valid @RequestBody CreatePumpClosureRequest request,
            @AuthenticationPrincipal User currentUser) {

        requireOwner(currentUser);

        pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found"));

        // Duplicate guard — gives a friendly error instead of a DB constraint violation
        closureRepository.findByPumpIdAndClosureDate(pumpId, request.closureDate()).ifPresent(existing -> {
            throw new BusinessException(
                    "A closure already exists for " + request.closureDate() +
                    ". Delete the existing record first if you want to update the reason.");
        });

        PumpClosure closure = PumpClosure.builder()
                .pumpId(pumpId)
                .closureDate(request.closureDate())
                .reason(request.reason())
                .createdByUserId(currentUser.getId())
                .build();

        PumpClosure saved = closureRepository.save(closure);

        log.info("Pump closure added: pump={} date={} reason='{}' by user={}",
                pumpId, request.closureDate(), request.reason(), currentUser.getId());

        auditService.log(pumpId, AuditAction.PUMP_CLOSURE_ADDED,
                "PumpClosure", saved.getId().toString(),
                "Closure on " + request.closureDate() + ": " + request.reason(),
                currentUser);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(toResponse(saved, currentUser.getFullName()));
    }

    /**
     * DELETE /api/pumps/{pumpId}/closures/{id}
     * Removes a closure record, effectively re-opening the day.
     * Operators can then open shifts for that date once the record is removed.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteClosure(
            @PathVariable Long pumpId,
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {

        requireOwner(currentUser);

        PumpClosure closure = closureRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Closure record not found"));

        if (!closure.getPumpId().equals(pumpId)) {
            throw new BusinessException("Closure does not belong to this pump");
        }

        closureRepository.delete(closure);

        log.info("Pump closure removed: pump={} date={} closureId={} by user={}",
                pumpId, closure.getClosureDate(), id, currentUser.getId());

        auditService.log(pumpId, AuditAction.PUMP_CLOSURE_ADDED,
                "PumpClosure", id.toString(),
                "Closure on " + closure.getClosureDate() + " removed (pump re-opened for that date)",
                currentUser);

        return ResponseEntity.noContent().build();
    }

    private void requireOwner(User user) {
        if (user.getRole() != UserRole.OWNER) {
            throw new BusinessException("Only Owner can manage pump closures.");
        }
    }

    private PumpClosureResponse toResponse(PumpClosure c, String createdByName) {
        return PumpClosureResponse.builder()
                .id(c.getId())
                .pumpId(c.getPumpId())
                .closureDate(c.getClosureDate())
                .reason(c.getReason())
                .createdByUserId(c.getCreatedByUserId())
                .createdByName(createdByName)
                .createdAt(c.getCreatedAt())
                .build();
    }
}
