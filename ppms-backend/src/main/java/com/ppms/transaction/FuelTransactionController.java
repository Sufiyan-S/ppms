package com.ppms.transaction;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;

import java.math.RoundingMode;
import java.util.List;

/**
 * Optional per-transaction fuel sale logging.
 *
 * Operators can log individual customer transactions during a shift for:
 *  - Large credit sales (fleet vehicles, company accounts)
 *  - UPI reference tracking (UTR number for reconciliation)
 *  - Vehicle-level records for fleet accounts
 *
 * These records do NOT affect shift totals — they are supplementary data only.
 */
@Slf4j
@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class FuelTransactionController {

    private final FuelTransactionRepository transactionRepository;
    private final ShiftRepository           shiftRepository;

    /**
     * POST /api/pumps/{pumpId}/fuel-transactions
     * Logs a single fuel sale transaction for an open shift.
     */
    @PostMapping("/{pumpId}/fuel-transactions")
    @Transactional
    public ResponseEntity<FuelTransaction> recordTransaction(
            @PathVariable Long pumpId,
            @Valid @RequestBody RecordFuelTransactionRequest request,
            @AuthenticationPrincipal User currentUser) {

        Shift shift = shiftRepository.findById(request.getShiftId())
                .orElseThrow(() -> new ResourceNotFoundException("Shift not found"));

        if (!shift.getPumpId().equals(pumpId)) {
            throw new BusinessException("Shift does not belong to this pump");
        }

        if (shift.getStatus() != ShiftStatus.OPEN && shift.getStatus() != ShiftStatus.OPEN_OVERDUE) {
            throw new BusinessException("Fuel transactions can only be logged for open shifts");
        }

        // Compute total = quantity × price per unit
        var totalAmount = request.getQuantityLitres()
                .multiply(request.getPricePerUnit())
                .setScale(2, RoundingMode.HALF_UP);

        FuelTransaction transaction = FuelTransaction.builder()
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
                .build();

        FuelTransaction saved = transactionRepository.save(transaction);

        log.info("Fuel transaction logged: pump={}, shift={}, fuel={}, qty={}L, amount={}, mode={}, by={}",
                pumpId, shift.getId(), request.getFuelType(), request.getQuantityLitres(),
                totalAmount, request.getPaymentMode(), currentUser.getId());

        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    /**
     * GET /api/pumps/{pumpId}/fuel-transactions?shiftId={id}&page=0&size=100
     *
     * When shiftId is provided: returns all transactions for that shift (bounded list).
     * When shiftId is absent: returns paginated transaction history for the pump.
     * Default page size 100 — transactions are usually fetched per-shift, not cross-shift.
     */
    @GetMapping("/{pumpId}/fuel-transactions")
    public ResponseEntity<?> getTransactions(
            @PathVariable Long pumpId,
            @RequestParam(required = false) Long shiftId,
            @PageableDefault(size = 100) Pageable pageable) {

        if (shiftId != null) {
            // Per-shift query is naturally bounded — return a simple list
            List<FuelTransaction> results = transactionRepository.findByShiftIdOrderByRecordedAtAsc(shiftId);
            return ResponseEntity.ok(results);
        }
        // Cross-shift pump query may be unbounded — always paginate
        Page<FuelTransaction> page = transactionRepository.findByPumpIdOrderByRecordedAtDesc(pumpId, pageable);
        return ResponseEntity.ok(page);
    }
}
