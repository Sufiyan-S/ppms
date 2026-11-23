package com.ppms.transaction;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.NozzleRepository;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

/**
 * Optional per-sale records (fleet vehicles, UPI references) logged during an open shift.
 * They are supplementary data only and never change shift totals.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FuelTransactionService {

    private final FuelTransactionRepository transactionRepository;
    private final ShiftRepository shiftRepository;
    private final NozzleRepository nozzleRepository;

    @Transactional
    public FuelTransaction recordTransaction(Long pumpId, RecordFuelTransactionRequest request, User currentUser) {
        Shift shift = shiftRepository.findByIdAndPumpIdForUpdate(request.getShiftId(), pumpId)
                .filter(found -> canSeeShift(currentUser, found))
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.SHIFT, "Shift not found"));
        if (!nozzleRepository.existsOnPump(request.getNozzleId(), pumpId)) {
            throw new ResourceNotFoundException(EntityType.NOZZLE, "Nozzle not found");
        }
        if (shift.getStatus() != ShiftStatus.OPEN && shift.getStatus() != ShiftStatus.OPEN_OVERDUE) {
            throw new BusinessException(ErrorCodes.FUEL_TRANSACTION_SHIFT_NOT_OPEN,
                    Map.of(),
                    "Fuel transactions can only be logged for open shifts");
        }

        BigDecimal totalAmount = request.getQuantityLitres()
                .multiply(request.getPricePerUnit())
                .setScale(2, RoundingMode.HALF_UP);

        FuelTransaction saved = transactionRepository.save(FuelTransaction.builder()
                .shiftId(shift.getId())
                .pumpId(pumpId)
                .nozzleId(request.getNozzleId())
                .fuelType(request.getFuelType())
                .quantityLitres(request.getQuantityLitres().setScale(3, RoundingMode.HALF_UP))
                .pricePerUnit(request.getPricePerUnit().setScale(4, RoundingMode.HALF_UP))
                .totalAmount(totalAmount)
                .paymentMode(request.getPaymentMode())
                .vehicleRegistration(request.getVehicleRegistration() != null
                        ? request.getVehicleRegistration().trim() : null)
                .upiReference(request.getUpiReference() != null
                        ? request.getUpiReference().trim() : null)
                .notes(request.getNotes() != null ? request.getNotes().trim() : null)
                .recordedByUserId(currentUser.getId())
                .build());

        log.info("Fuel transaction logged: pump={}, shift={}, fuel={}, qty={}L, amount={}, mode={}, by={}",
                pumpId, shift.getId(), request.getFuelType(), request.getQuantityLitres(),
                totalAmount, request.getPaymentMode(), currentUser.getId());
        return saved;
    }

    @Transactional(readOnly = true)
    public List<FuelTransaction> getTransactionsForShift(Long pumpId, Long shiftId, User currentUser) {
        boolean visible = shiftRepository.findByIdAndPumpId(shiftId, pumpId)
                .filter(shift -> canSeeShift(currentUser, shift))
                .isPresent();
        if (!visible) {
            throw new ResourceNotFoundException(EntityType.SHIFT, "Shift not found");
        }
        return transactionRepository.findByShiftIdOrderByRecordedAtAsc(shiftId);
    }

    @Transactional(readOnly = true)
    public Page<FuelTransaction> getTransactionsForPump(Long pumpId, Pageable pageable, User currentUser) {
        if (currentUser.getRole() == UserRole.OPERATOR) {
            return transactionRepository.findForOperatorShifts(pumpId, currentUser.getId(), pageable);
        }
        return transactionRepository.findByPumpIdOrderByRecordedAtDesc(pumpId, pageable);
    }

    private boolean canSeeShift(User currentUser, Shift shift) {
        return currentUser.getRole() != UserRole.OPERATOR || currentUser.getId().equals(shift.getOperatorId());
    }
}
