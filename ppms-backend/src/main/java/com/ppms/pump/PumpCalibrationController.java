package com.ppms.pump;

import com.ppms.common.dto.PagedResponse;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/pumps/{pumpId}/calibrations")
@RequiredArgsConstructor
public class PumpCalibrationController {

    private final NozzleCalibrationLogRepository calibrationRepository;
    private final UserRepository userRepository;

    /**
     * GET /api/pumps/{pumpId}/calibrations?page=0&size=10
     * Returns paginated calibration records across all nozzles for the pump, newest logged first.
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<PagedResponse<CalibrationLogResponse>> getPumpCalibrations(
            @PathVariable Long pumpId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {

        var logsPage = calibrationRepository.findByPumpIdOrderByCreatedAtDescCalibrationDateDesc(
                pumpId, PageRequest.of(page, size));

        Set<Long> userIds = logsPage.getContent().stream()
                .map(NozzleCalibrationLog::getLoggedByUserId)
                .collect(Collectors.toSet());
        Map<Long, String> nameById = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));

        return ResponseEntity.ok(PagedResponse.of(
                logsPage.map(c -> CalibrationLogResponse.builder()
                        .id(c.getId())
                        .pumpId(c.getPumpId())
                        .nozzleId(c.getNozzleId())
                        .calibrationDate(c.getCalibrationDate())
                        .nextCalibrationDue(c.getNextCalibrationDue())
                        .calibratedBy(c.getCalibratedBy())
                        .certificateReference(c.getCertificateReference())
                        .notes(c.getNotes())
                        .loggedByUserId(c.getLoggedByUserId())
                        .loggedByName(nameById.getOrDefault(c.getLoggedByUserId(), "Unknown"))
                        .createdAt(c.getCreatedAt())
                        .build())));
    }
}
