package com.ppms.shift;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * A handover closes the outgoing operator's shift with the readings and payments counted at handover, then opens a
 * new shift for the incoming operator on the same nozzles and shift window from those readings. Both happen in one
 * transaction, so a refused close never leaves the incoming operator with a shift.
 * The DB-level UNIQUE constraint on outgoing_shift_id is the final guard against a duplicate handover.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShiftHandoverService {

    private final ShiftHandoverRepository handoverRepository;
    private final ShiftRepository shiftRepository;
    private final UserRepository userRepository;
    private final ShiftService shiftService;
    private final ShiftReadModelService shiftReadModelService;
    private final BusinessClock businessClock;

    public record HandoverResult(ShiftHandover handover, ShiftResponse closedShift, ShiftResponse openedShift) {}

    @Transactional
    public HandoverResult createHandover(Long pumpId, CreateHandoverRequest request, User currentUser) {
        Shift outgoingShift = shiftRepository.findByIdAndPumpIdForUpdate(request.outgoingShiftId(), pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.SHIFT, "Shift not found"));

        if (outgoingShift.getStatus() != ShiftStatus.OPEN) {
            throw new BusinessException(outgoingShift.getStatus() == ShiftStatus.OPEN_OVERDUE
                            ? ErrorCodes.HANDOVER_SHIFT_OVERDUE : ErrorCodes.HANDOVER_SHIFT_NOT_OPEN,
                    Map.of("statusCode", outgoingShift.getStatus().name()),
                    "Handover can only be created for an OPEN shift. Current status: " + outgoingShift.getStatus() +
                    (outgoingShift.getStatus() == ShiftStatus.OPEN_OVERDUE
                            ? ". Close this shift and open a new shift for the incoming operator instead." : ""));
        }
        rejectAfterScheduledEnd(outgoingShift);

        handoverRepository.findByOutgoingShiftId(request.outgoingShiftId()).ifPresent(existing -> {
            throw new BusinessException(ErrorCodes.HANDOVER_ALREADY_EXISTS,
                    Map.of("shiftId", request.outgoingShiftId(), "handoverId", existing.getId()),
                    "A handover already exists for shift #" + request.outgoingShiftId() +
                    " (handover ID: " + existing.getId() + ")");
        });

        User incomingOperator = userRepository.findById(request.incomingOperatorId())
                .filter(user -> user.getRole() == UserRole.OPERATOR && pumpId.equals(user.getAssignedPumpId()))
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.OPERATOR, "Incoming operator not found"));
        if (incomingOperator.getStatus() != UserStatus.ACTIVE) {
            throw new BusinessException(ErrorCodes.HANDOVER_OPERATOR_INACTIVE,
                    Map.of("operatorName", incomingOperator.getFullName()),
                    incomingOperator.getFullName() + " is inactive and cannot take over a shift.");
        }

        if (outgoingShift.getOperatorId().equals(request.incomingOperatorId())) {
            throw new BusinessException(ErrorCodes.HANDOVER_SAME_OPERATOR,
                    Map.of(),
                    "Incoming and outgoing operators cannot be the same person");
        }

        shiftRepository.findOpenShiftByOperator(request.incomingOperatorId()).ifPresent(existing -> {
            throw new BusinessException(ErrorCodes.HANDOVER_OPERATOR_HAS_OPEN_SHIFT,
                    Map.of("operatorName", incomingOperator.getFullName(), "shiftId", existing.getId()),
                    incomingOperator.getFullName() + " already has an open shift (ID " + existing.getId() +
                    "). They must close it before taking a handover.");
        });

        if (request.closing() == null) {
            throw new BusinessException(ErrorCodes.HANDOVER_CLOSING_REQUIRED, Map.of(),
                    "Enter the outgoing operator's closing meter readings and payments: the shift is closed at handover.");
        }
        ShiftResponse closedShift = shiftService.closeShift(pumpId, outgoingShift.getId(), request.closing(), currentUser);
        ShiftResponse openedShift = shiftService.openShiftForHandover(outgoingShift, incomingOperator, currentUser);

        ShiftHandover handover = ShiftHandover.builder()
                .pumpId(pumpId)
                .outgoingShiftId(outgoingShift.getId())
                .outgoingOperatorId(outgoingShift.getOperatorId())
                .incomingOperatorId(incomingOperator.getId())
                .incomingShiftId(openedShift.getId())
                .physicalCashVerified(request.physicalCashVerified())
                .meterReadingsVerified(request.meterReadingsVerified())
                .notes(request.notes())
                .handoverTime(outgoingShift.getActualEndTime())
                .build();

        try {
            handover = handoverRepository.saveAndFlush(handover);
        } catch (DataIntegrityViolationException e) {
            throw new BusinessException(ErrorCodes.HANDOVER_CREATED_CONCURRENTLY,
                    Map.of("shiftId", request.outgoingShiftId()),
                    "A handover for shift #" + request.outgoingShiftId() + " was just created by a concurrent request. " +
                    "Please refresh and try again.");
        }

        log.info("Shift {} handed over: closed as {}, new shift {} opened for operator {}",
                outgoingShift.getId(), closedShift.getStatus(), openedShift.getId(), incomingOperator.getId());
        return new HandoverResult(handover, closedShift, openedShift);
    }

    /** The incoming shift keeps the outgoing shift's window, so it must start before that window ends. */
    private void rejectAfterScheduledEnd(Shift outgoingShift) {
        OffsetDateTime scheduledEnd = shiftReadModelService.computeScheduledEndTime(outgoingShift);
        if (scheduledEnd != null && businessClock.now().isAfter(scheduledEnd)) {
            throw new BusinessException(ErrorCodes.HANDOVER_AFTER_SCHEDULED_END,
                    Map.of("shiftId", outgoingShift.getId()),
                    "Shift #" + outgoingShift.getId() + " has passed its scheduled end, so it cannot be handed over. " +
                    "Close this shift and open a new shift for the incoming operator instead.");
        }
    }
}
