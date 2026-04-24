package com.ppms.shift;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Handles shift handover creation under a single transaction.
 * Keeping the duplicate-check and save in one @Transactional boundary prevents the TOCTOU
 * race where two concurrent requests both pass the findByOutgoingShiftId guard and each
 * create a duplicate handover row for the same outgoing shift.
 * The DB-level UNIQUE constraint on outgoing_shift_id is the final safety net.
 */
@Service
@RequiredArgsConstructor
public class ShiftHandoverService {

    private final ShiftHandoverRepository handoverRepository;
    private final ShiftRepository shiftRepository;
    private final UserRepository userRepository;

    @Transactional
    public ShiftHandover createHandover(Long pumpId, CreateHandoverRequest request) {
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

        handoverRepository.findByOutgoingShiftId(request.outgoingShiftId()).ifPresent(existing -> {
            throw new BusinessException(
                    "A handover already exists for shift #" + request.outgoingShiftId() +
                    " (handover ID: " + existing.getId() + ")");
        });

        com.ppms.user.User incomingOperator = userRepository.findById(request.incomingOperatorId())
                .orElseThrow(() -> new ResourceNotFoundException("Incoming operator not found"));

        if (outgoingShift.getOperatorId().equals(request.incomingOperatorId())) {
            throw new BusinessException("Incoming and outgoing operators cannot be the same person");
        }

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

        try {
            return handoverRepository.save(handover);
        } catch (DataIntegrityViolationException e) {
            // Concurrent request raced past the application-level check above
            throw new BusinessException(
                    "A handover for shift #" + request.outgoingShiftId() + " was just created by a concurrent request. " +
                    "Please refresh and try again.");
        }
    }
}
