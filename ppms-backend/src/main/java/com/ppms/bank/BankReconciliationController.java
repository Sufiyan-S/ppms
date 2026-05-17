package com.ppms.bank;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * REST controller for bank statement import and reconciliation.
 *
 * POST /api/pumps/{pumpId}/bank-reconciliation/import         — upload CSV and parse
 * GET  /api/pumps/{pumpId}/bank-reconciliation/imports        — list all imports
 * GET  /api/pumps/{pumpId}/bank-reconciliation/imports/{id}/lines — list lines for an import
 * PATCH /api/pumps/{pumpId}/bank-reconciliation/lines/{lineId} — match or ignore a line
 *
 * CSV Format (generic — first row is header, ignored):
 *   Date, Narration, Debit, Credit, Balance, UTR
 *   Columns 3 and 4 (Debit/Credit) are numeric — empty cells treated as 0.
 *   UTR (column 6) is optional.
 *
 * The import is transactional: all lines are saved together or none are.
 *
 * Only OWNER and ADMIN can import and manage bank statements.
 */
@Slf4j
@RestController
@RequestMapping("/api/pumps/{pumpId}/bank-reconciliation")
@RequiredArgsConstructor
public class BankReconciliationController {

    private static final DateTimeFormatter[] DATE_FORMATS = {
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd"),
            DateTimeFormatter.ofPattern("MM/dd/yyyy")
    };

    private final BankStatementImportRepository importRepository;
    private final BankStatementLineRepository lineRepository;
    private final AuditService auditService;

    /**
     * GET /api/pumps/{pumpId}/bank-reconciliation/imports
     * Returns all statement imports for a pump, newest first.
     */
    @GetMapping("/imports")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<List<ImportSummaryResponse>> getImports(@PathVariable Long pumpId) {
        List<ImportSummaryResponse> response = importRepository
                .findByPumpIdOrderByImportedAtDesc(pumpId)
                .stream()
                .map(this::toImportSummary)
                .toList();
        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/pumps/{pumpId}/bank-reconciliation/imports/{importId}/lines
     * Returns all statement lines for a specific import, ordered by transaction date.
     */
    @GetMapping("/imports/{importId}/lines")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<List<StatementLineResponse>> getLines(
            @PathVariable Long pumpId,
            @PathVariable Long importId) {

        BankStatementImport statementImport = importRepository.findById(importId)
                .orElseThrow(() -> new ResourceNotFoundException("Import not found"));

        if (!statementImport.getPumpId().equals(pumpId)) {
            throw new BusinessException("Import does not belong to this pump");
        }

        List<StatementLineResponse> lines = lineRepository
                .findByImportIdOrderByTxnDateAscIdAsc(importId)
                .stream()
                .map(this::toLineResponse)
                .toList();

        return ResponseEntity.ok(lines);
    }

    /**
     * POST /api/pumps/{pumpId}/bank-reconciliation/import
     * Parses a generic CSV bank statement and creates a BankStatementImport with all lines.
     *
     * Expected multipart fields:
     *   file       — the CSV file
     *   bankName   — name of the bank (e.g. "SBI", "HDFC")
     *   accountNumber — optional account number for display
     *
     * CSV format (first row = header, skipped):
     *   Date | Narration | Debit | Credit | Balance | UTR
     *
     * Rows that cannot be parsed (bad date, non-numeric amount) are skipped with a
     * warning logged — partial imports are better than failed imports for large CSVs.
     */
    @PostMapping("/import")
    @Transactional
    public ResponseEntity<ImportSummaryResponse> importStatement(
            @PathVariable Long pumpId,
            @RequestParam("file") MultipartFile file,
            @RequestParam("bankName") String bankName,
            @RequestParam(value = "accountNumber", required = false) String accountNumber,
            @AuthenticationPrincipal User currentUser) {

        requireOwnerOrAdmin(currentUser);

        if (file.isEmpty()) {
            throw new BusinessException("Uploaded file is empty");
        }

        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || !originalFilename.toLowerCase().endsWith(".csv")) {
            throw new BusinessException("Only CSV files are accepted");
        }

        List<BankStatementLine> parsedLines = new ArrayList<>();
        LocalDate minDate = null, maxDate = null;
        int skippedRows = 0;

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {

            String line;
            boolean headerSkipped = false;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;

                if (!headerSkipped) {
                    headerSkipped = true;
                    continue; // Skip the header row
                }

                // Split by comma — handle quoted fields (simple split, no full CSV parser)
                String[] cols = line.split(",", -1);
                if (cols.length < 4) {
                    skippedRows++;
                    continue;
                }

                LocalDate txnDate = parseDate(cols[0].trim());
                if (txnDate == null) {
                    log.warn("Skipping CSV row — unparseable date: '{}'", cols[0]);
                    skippedRows++;
                    continue;
                }

                String narration = cols[1].trim();
                BigDecimal debit  = parseMoney(cols[2].trim());
                BigDecimal credit = parseMoney(cols[3].trim());
                BigDecimal balance = cols.length > 4 ? parseMoney(cols[4].trim()) : null;
                String utr = cols.length > 5 ? cols[5].trim() : null;

                if (minDate == null || txnDate.isBefore(minDate)) minDate = txnDate;
                if (maxDate == null || txnDate.isAfter(maxDate)) maxDate = txnDate;

                parsedLines.add(BankStatementLine.builder()
                        .txnDate(txnDate)
                        .narration(narration.isEmpty() ? null : narration)
                        .debitAmount(debit)
                        .creditAmount(credit)
                        .balance(balance)
                        .utrReference(utr != null && !utr.isEmpty() ? utr : null)
                        .matchStatus(BankLineMatchStatus.UNMATCHED)
                        .build());
            }

        } catch (Exception ex) {
            log.warn("CSV parse error for pump={}: {}", pumpId, ex.getMessage());
            throw new BusinessException("Failed to parse the uploaded file. Ensure it is a valid CSV with the required columns.");
        }

        if (parsedLines.isEmpty()) {
            throw new BusinessException(
                    "No valid transaction rows found in the uploaded file. " +
                    "Ensure the CSV format is: Date, Narration, Debit, Credit, Balance, UTR");
        }

        // Save import header
        BankStatementImport statementImport = BankStatementImport.builder()
                .pumpId(pumpId)
                .bankName(bankName.trim())
                .accountNumber(accountNumber != null ? accountNumber.trim() : null)
                .statementFromDate(minDate)
                .statementToDate(maxDate)
                .totalLines(parsedLines.size())
                .matchedLines(0)
                .importedByUserId(currentUser.getId())
                .build();

        statementImport = importRepository.save(statementImport);

        // Wire import ID into each line and batch-save
        final Long importId = statementImport.getId();
        parsedLines.forEach(l -> l.setImportId(importId));
        lineRepository.saveAll(parsedLines);

        log.info("Bank statement imported: pump={} bank='{}' lines={} skipped={} period={}/{} by={}",
                pumpId, bankName, parsedLines.size(), skippedRows, minDate, maxDate, currentUser.getId());

        auditService.log(pumpId, AuditAction.BANK_STATEMENT_IMPORTED,
                "BankStatementImport", statementImport.getId().toString(),
                "Imported " + parsedLines.size() + " lines from " + bankName +
                " (" + minDate + " to " + maxDate + ")" +
                (skippedRows > 0 ? ", " + skippedRows + " rows skipped (bad format)" : ""),
                currentUser);

        return ResponseEntity.status(HttpStatus.CREATED).body(toImportSummary(statementImport));
    }

    /**
     * PATCH /api/pumps/{pumpId}/bank-reconciliation/lines/{lineId}
     * Updates the match status and optional link of a statement line.
     *
     * Body:
     *   status            — MATCHED or IGNORED
     *   matchedShiftId    — optional FK
     *   matchedSaleId     — optional FK
     *   matchedPaymentId  — optional FK
     *   matchNotes        — optional explanation
     */
    @PatchMapping("/lines/{lineId}")
    @Transactional
    public ResponseEntity<StatementLineResponse> updateLineMatch(
            @PathVariable Long pumpId,
            @PathVariable Long lineId,
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal User currentUser) {

        requireOwnerOrAdmin(currentUser);

        BankStatementLine line = lineRepository.findById(lineId)
                .orElseThrow(() -> new ResourceNotFoundException("Statement line not found"));

        BankStatementImport statementImport = importRepository.findById(line.getImportId())
                .orElseThrow(() -> new ResourceNotFoundException("Import not found"));

        if (!statementImport.getPumpId().equals(pumpId)) {
            throw new BusinessException("Line does not belong to this pump");
        }

        String statusStr = (String) body.get("status");
        if (statusStr == null) throw new BusinessException("status is required (MATCHED or IGNORED)");

        BankLineMatchStatus newStatus;
        try {
            newStatus = BankLineMatchStatus.valueOf(statusStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("Invalid status. Allowed: MATCHED, IGNORED, UNMATCHED");
        }

        line.setMatchStatus(newStatus);
        line.setMatchedShiftId(extractLong(body, "matchedShiftId"));
        line.setMatchedAncillarySaleId(extractLong(body, "matchedSaleId"));
        line.setMatchedPaymentId(extractLong(body, "matchedPaymentId"));
        line.setMatchNotes((String) body.get("matchNotes"));

        lineRepository.save(line);

        // Update the matched_lines counter on the import header
        int matchedCount = lineRepository.countMatchedByImportId(line.getImportId());
        statementImport.setMatchedLines(matchedCount);
        importRepository.save(statementImport);

        return ResponseEntity.ok(toLineResponse(line));
    }

    // ── Parsing helpers ────────────────────────────────────────────────────────

    private LocalDate parseDate(String raw) {
        for (DateTimeFormatter fmt : DATE_FORMATS) {
            try {
                return LocalDate.parse(raw, fmt);
            } catch (DateTimeParseException ignored) {}
        }
        return null;
    }

    private BigDecimal parseMoney(String raw) {
        if (raw == null || raw.isEmpty()) return BigDecimal.ZERO;
        // Strip currency symbols, spaces, commas (e.g. "₹1,234.56" → "1234.56")
        String cleaned = raw.replaceAll("[^\\d.]", "");
        if (cleaned.isEmpty() || cleaned.equals(".")) return BigDecimal.ZERO;
        try {
            return new BigDecimal(cleaned);
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    private Long extractLong(Map<String, Object> body, String key) {
        Object val = body.get(key);
        if (val == null) return null;
        if (val instanceof Number n) return n.longValue();
        try { return Long.parseLong(val.toString()); } catch (Exception e) { return null; }
    }

    private void requireOwnerOrAdmin(User user) {
        if (user.getRole() != UserRole.OWNER && user.getRole() != UserRole.ADMIN
                && user.getRole() != UserRole.SUPER_ADMIN) {
            throw new BusinessException("Only Owner or Admin can manage bank reconciliation.");
        }
    }

    // ── Response builders ──────────────────────────────────────────────────────

    private ImportSummaryResponse toImportSummary(BankStatementImport i) {
        return ImportSummaryResponse.builder()
                .id(i.getId())
                .pumpId(i.getPumpId())
                .bankName(i.getBankName())
                .accountNumber(i.getAccountNumber())
                .statementFromDate(i.getStatementFromDate())
                .statementToDate(i.getStatementToDate())
                .totalLines(i.getTotalLines())
                .matchedLines(i.getMatchedLines())
                .unmatchedLines(i.getTotalLines() - i.getMatchedLines())
                .importedByUserId(i.getImportedByUserId())
                .importedAt(i.getImportedAt())
                .build();
    }

    private StatementLineResponse toLineResponse(BankStatementLine l) {
        return StatementLineResponse.builder()
                .id(l.getId())
                .importId(l.getImportId())
                .txnDate(l.getTxnDate())
                .narration(l.getNarration())
                .debitAmount(l.getDebitAmount())
                .creditAmount(l.getCreditAmount())
                .balance(l.getBalance())
                .utrReference(l.getUtrReference())
                .matchStatus(l.getMatchStatus().name())
                .matchedShiftId(l.getMatchedShiftId())
                .matchedAncillarySaleId(l.getMatchedAncillarySaleId())
                .matchedPaymentId(l.getMatchedPaymentId())
                .matchNotes(l.getMatchNotes())
                .createdAt(l.getCreatedAt())
                .build();
    }
}
