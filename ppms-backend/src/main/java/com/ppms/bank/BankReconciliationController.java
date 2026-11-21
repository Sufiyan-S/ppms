package com.ppms.bank;

import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/pumps/{pumpId}/bank-reconciliation")
@RequiredArgsConstructor
public class BankReconciliationController {

    private final BankStatementImportService importService;

    @GetMapping("/imports")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<List<ImportSummaryResponse>> getImports(@PathVariable Long pumpId) {
        return ResponseEntity.ok(importService.getImports(pumpId));
    }

    @GetMapping("/imports/{importId}/lines")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<List<StatementLineResponse>> getLines(
            @PathVariable Long pumpId,
            @PathVariable Long importId) {
        return ResponseEntity.ok(importService.getLines(pumpId, importId));
    }

    /** Multipart fields: file (CSV), bankName, optional accountNumber. */
    @PostMapping("/import")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'SUPER_ADMIN')")
    public ResponseEntity<ImportSummaryResponse> importStatement(
            @PathVariable Long pumpId,
            @RequestParam("file") MultipartFile file,
            @RequestParam("bankName") String bankName,
            @RequestParam(value = "accountNumber", required = false) String accountNumber,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(importService.importStatement(pumpId, file, bankName, accountNumber, currentUser));
    }

    /** Body: status (MATCHED, IGNORED or UNMATCHED), optional matchedShiftId, matchedSaleId, matchedPaymentId, matchNotes. */
    @PatchMapping("/lines/{lineId}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'SUPER_ADMIN')")
    public ResponseEntity<StatementLineResponse> updateLineMatch(
            @PathVariable Long pumpId,
            @PathVariable Long lineId,
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(importService.updateLineMatch(pumpId, lineId, body));
    }
}
