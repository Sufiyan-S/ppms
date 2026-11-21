package com.ppms.transaction;

import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * Optional per-transaction fuel sale logging (fleet vehicles, UPI references).
 * These records do NOT affect shift totals — they are supplementary data only.
 */
@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class FuelTransactionController {

    private final FuelTransactionService transactionService;

    /**
     * POST /api/pumps/{pumpId}/fuel-transactions
     * Logs a single fuel sale transaction for an open shift.
     */
    @PostMapping("/{pumpId}/fuel-transactions")
    public ResponseEntity<FuelTransaction> recordTransaction(
            @PathVariable Long pumpId,
            @Valid @RequestBody RecordFuelTransactionRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(transactionService.recordTransaction(pumpId, request, currentUser));
    }

    /**
     * GET /api/pumps/{pumpId}/fuel-transactions?shiftId={id}&page=0&size=100
     * With shiftId: every transaction of that shift. Without: paginated pump history, newest first.
     */
    @GetMapping("/{pumpId}/fuel-transactions")
    public ResponseEntity<?> getTransactions(
            @PathVariable Long pumpId,
            @RequestParam(required = false) Long shiftId,
            @PageableDefault(size = 100) Pageable pageable) {
        if (shiftId != null) {
            return ResponseEntity.ok(transactionService.getTransactionsForShift(pumpId, shiftId));
        }
        return ResponseEntity.ok(transactionService.getTransactionsForPump(pumpId, pageable));
    }
}
