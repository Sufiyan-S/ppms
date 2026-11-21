package com.ppms.transaction;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.NozzleRepository;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

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
                .orElseThrow(() -> new ResourceNotFoundException("Shift not found"));
        if (!nozzleRepository.existsOnPump(request.getNozzleId(), pumpId)) {
            throw new ResourceNotFoundException("Nozzle not found");
        }
        if (shift.getStatus() != ShiftStatus.OPEN && shift.getStatus() != ShiftStatus.OPEN_OVERDUE) {
            throw new BusinessException("Fuel transactions can only be logged for open shifts");
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
    public List<FuelTransaction> getTransactionsForShift(Long pumpId, Long shiftId) {
        if (!shiftRepository.existsByIdAndPumpId(shiftId, pumpId)) {
            throw new ResourceNotFoundException("Shift not found");
        }
        return transactionRepository.findByShiftIdOrderByRecordedAtAsc(shiftId);
    }

    @Transactional(readOnly = true)
    public Page<FuelTransaction> getTransactionsForPump(Long pumpId, Pageable pageable) {
        return transactionRepository.findByPumpIdOrderByRecordedAtDesc(pumpId, pageable);
    }
}
