package com.ppms.pump;

import com.ppms.common.dto.PageRequests;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.dto.PagedResponse;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * REST controller for nozzle calibration log management.
 *
 * GET  /api/pumps/{pumpId}/nozzles/{nozzleId}/calibrations     — list calibration history (OWNER, ADMIN, MANAGER)
 * POST /api/pumps/{pumpId}/nozzles/{nozzleId}/calibrations     — log a new calibration event (OWNER, ADMIN only)
 *
 * Every calibration is logged with next_calibration_due:
 * - The notification service alerts 7 days before that date and again once it has passed.
 * - ShiftService.openShift() will BLOCK shift creation if the date has passed
 *   (calibration overdue = pump cannot legally operate until re-calibrated).
 */
@Slf4j
@RestController
@RequestMapping("/api/pumps/{pumpId}/nozzles/{nozzleId}/calibrations")
@RequiredArgsConstructor
public class NozzleCalibrationController {

    private final NozzleCalibrationLogRepository calibrationRepository;
    private final NozzleRepository nozzleRepository;
    private final DispensaryUnitRepository dispensaryUnitRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;

    /**
     * GET /api/pumps/{pumpId}/nozzles/{nozzleId}/calibrations?page=0&size=10
     * Returns paginated calibration records for a nozzle, newest logged first.
     * Manager can view history but cannot add records.
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<PagedResponse<CalibrationLogResponse>> getCalibrations(
            @PathVariable Long pumpId,
            @PathVariable Long nozzleId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {

        Nozzle nozzle = findNozzleForPump(nozzleId, pumpId);

        var logsPage = calibrationRepository.findByNozzleIdOrderByCreatedAtDescCalibrationDateDesc(
                nozzle.getId(), PageRequests.of(page, size));

        // Batch-load user names for this page only — avoids N+1
        Set<Long> userIds = logsPage.getContent().stream()
                .map(NozzleCalibrationLog::getLoggedByUserId)
                .collect(Collectors.toSet());
        Map<Long, String> nameById = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));

        return ResponseEntity.ok(PagedResponse.of(
                logsPage.map(c -> toResponse(c, nameById.getOrDefault(c.getLoggedByUserId(), "Unknown")))));
    }

    /**
     * POST /api/pumps/{pumpId}/nozzles/{nozzleId}/calibrations
     * Logs a calibration event for the nozzle.
     *
     * nextCalibrationDue and certificateReference are required: shifts are blocked once the due date passes,
     * ensuring the nozzle cannot operate with an expired calibration certificate.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<CalibrationLogResponse> logCalibration(
            @PathVariable Long pumpId,
            @PathVariable Long nozzleId,
            @Valid @RequestBody LogCalibrationRequest request,
            @AuthenticationPrincipal User currentUser) {

        Nozzle nozzle = findNozzleForPump(nozzleId, pumpId);

        if (!request.nextCalibrationDue().isAfter(request.calibrationDate())) {
            throw new BusinessException(ErrorCodes.CALIBRATION_NEXT_DUE_NOT_AFTER_DATE, Map.of(),
                    "The next calibration due date must be after the calibration date.");
        }

        NozzleCalibrationLog log = NozzleCalibrationLog.builder()
                .pumpId(pumpId)
                .nozzleId(nozzle.getId())
                .calibrationDate(request.calibrationDate())
                .nextCalibrationDue(request.nextCalibrationDue())
                .calibratedBy(request.calibratedBy())
                .certificateReference(request.certificateReference())
                .notes(request.notes())
                .loggedByUserId(currentUser.getId())
                .build();

        NozzleCalibrationLog saved = calibrationRepository.save(log);

        NozzleCalibrationController.log.info(
                "Calibration logged: pump={} nozzle={} date={} nextDue={} cert={} by={}",
                pumpId, nozzleId, request.calibrationDate(), request.nextCalibrationDue(),
                request.certificateReference(), currentUser.getId());

        auditService.log(pumpId, AuditAction.CALIBRATION_LOGGED,
                "NozzleCalibrationLog", saved.getId().toString(),
                "Calibration logged for nozzle #" + nozzle.getNozzleNumber() +
                " on " + request.calibrationDate() + ", next due: " + request.nextCalibrationDue(),
                currentUser);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(toResponse(saved, currentUser.getFullName()));
    }

    private Nozzle findNozzleForPump(Long nozzleId, Long pumpId) {
        Nozzle nozzle = nozzleRepository.findById(nozzleId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.NOZZLE, "Nozzle not found"));
        DispensaryUnit du = dispensaryUnitRepository.findById(nozzle.getDuId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.DISPENSARY_UNIT,
                        "Dispensary unit not found"));
        if (!du.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.NOZZLE, "Nozzle not found");
        }
        return nozzle;
    }

    private CalibrationLogResponse toResponse(NozzleCalibrationLog c, String loggedByName) {
        return CalibrationLogResponse.builder()
                .id(c.getId())
                .pumpId(c.getPumpId())
                .nozzleId(c.getNozzleId())
                .calibrationDate(c.getCalibrationDate())
                .nextCalibrationDue(c.getNextCalibrationDue())
                .calibratedBy(c.getCalibratedBy())
                .certificateReference(c.getCertificateReference())
                .notes(c.getNotes())
                .loggedByUserId(c.getLoggedByUserId())
                .loggedByName(loggedByName)
                .createdAt(c.getCreatedAt())
                .build();
    }
}
