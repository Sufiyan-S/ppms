package com.ppms.bank;

import com.ppms.ancillary.AncillarySaleRepository;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.credit.CreditPaymentRepository;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;

@Slf4j
@Service
@RequiredArgsConstructor
public class BankStatementImportService {

    private static final DateTimeFormatter[] DATE_FORMATS = {
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd"),
            DateTimeFormatter.ofPattern("MM/dd/yyyy")
    };

    private final BankStatementImportRepository importRepository;
    private final BankStatementLineRepository lineRepository;
    private final AuditService auditService;
    private final ShiftRepository shiftRepository;
    private final AncillarySaleRepository ancillarySaleRepository;
    private final CreditPaymentRepository creditPaymentRepository;

    private record ParsedStatement(List<BankStatementLine> lines, int skippedRows, LocalDate from, LocalDate to) {}

    @Transactional(readOnly = true)
    public List<ImportSummaryResponse> getImports(Long pumpId) {
        return importRepository.findByPumpIdOrderByImportedAtDesc(pumpId).stream()
                .map(this::toImportSummary)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<StatementLineResponse> getLines(Long pumpId, Long importId) {
        importRepository.findById(importId)
                .filter(found -> found.getPumpId().equals(pumpId))
                .orElseThrow(() -> new ResourceNotFoundException("Import not found"));

        return lineRepository.findByImportIdOrderByTxnDateAscIdAsc(importId).stream()
                .map(this::toLineResponse)
                .toList();
    }

    /**
     * CSV format (first row is a header and is skipped): Date, Narration, Debit, Credit, Balance, UTR.
     * Rows with an unreadable date or amount are skipped and counted, so one bad row does not fail a large import.
     */
    @Transactional
    public ImportSummaryResponse importStatement(Long pumpId, MultipartFile file, String bankName,
                                                 String accountNumber, User currentUser) {
        if (file.isEmpty()) {
            throw new BusinessException("Uploaded file is empty");
        }
        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || !originalFilename.toLowerCase().endsWith(".csv")) {
            throw new BusinessException("Only CSV files are accepted");
        }

        ParsedStatement parsed = parse(pumpId, file);
        if (parsed.lines().isEmpty()) {
            throw new BusinessException(
                    "No valid transaction rows found in the uploaded file. " +
                    "Ensure the CSV format is: Date, Narration, Debit, Credit, Balance, UTR");
        }

        BankStatementImport statementImport = importRepository.save(BankStatementImport.builder()
                .pumpId(pumpId)
                .bankName(bankName.trim())
                .accountNumber(accountNumber != null ? accountNumber.trim() : null)
                .statementFromDate(parsed.from())
                .statementToDate(parsed.to())
                .totalLines(parsed.lines().size())
                .matchedLines(0)
                .importedByUserId(currentUser.getId())
                .build());

        Long importId = statementImport.getId();
        parsed.lines().forEach(line -> line.setImportId(importId));
        lineRepository.saveAll(parsed.lines());

        log.info("Bank statement imported: pump={} bank='{}' lines={} skipped={} period={}/{} by={}",
                pumpId, bankName, parsed.lines().size(), parsed.skippedRows(), parsed.from(), parsed.to(),
                currentUser.getId());

        auditService.log(pumpId, AuditAction.BANK_STATEMENT_IMPORTED,
                "BankStatementImport", importId.toString(),
                "Imported " + parsed.lines().size() + " lines from " + bankName +
                " (" + parsed.from() + " to " + parsed.to() + ")" +
                (parsed.skippedRows() > 0 ? ", " + parsed.skippedRows() + " rows skipped (bad format)" : ""),
                currentUser);

        return toImportSummary(statementImport);
    }

    @Transactional
    public StatementLineResponse updateLineMatch(Long pumpId, Long lineId, Map<String, Object> body) {
        BankStatementLine line = lineRepository.findById(lineId)
                .orElseThrow(() -> new ResourceNotFoundException("Statement line not found"));

        BankStatementImport statementImport = importRepository.findById(line.getImportId())
                .filter(found -> found.getPumpId().equals(pumpId))
                .orElseThrow(() -> new ResourceNotFoundException("Statement line not found"));

        String statusStr = (String) body.get("status");
        if (statusStr == null) throw new BusinessException("status is required (MATCHED or IGNORED)");

        BankLineMatchStatus newStatus;
        try {
            newStatus = BankLineMatchStatus.valueOf(statusStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("Invalid status. Allowed: MATCHED, IGNORED, UNMATCHED");
        }

        Long matchedShiftId = extractLong(body, "matchedShiftId");
        Long matchedSaleId = extractLong(body, "matchedSaleId");
        Long matchedPaymentId = extractLong(body, "matchedPaymentId");
        requireOnPump(matchedShiftId, id -> shiftRepository.existsByIdAndPumpId(id, pumpId), "Shift");
        requireOnPump(matchedSaleId, id -> ancillarySaleRepository.existsByIdAndPumpId(id, pumpId), "Sale");
        requireOnPump(matchedPaymentId, id -> creditPaymentRepository.existsByIdAndPumpId(id, pumpId), "Payment");

        line.setMatchStatus(newStatus);
        line.setMatchedShiftId(matchedShiftId);
        line.setMatchedAncillarySaleId(matchedSaleId);
        line.setMatchedPaymentId(matchedPaymentId);
        line.setMatchNotes((String) body.get("matchNotes"));
        lineRepository.save(line);

        statementImport.setMatchedLines(lineRepository.countMatchedByImportId(line.getImportId()));
        importRepository.save(statementImport);

        return toLineResponse(line);
    }

    private ParsedStatement parse(Long pumpId, MultipartFile file) {
        List<BankStatementLine> lines = new ArrayList<>();
        LocalDate minDate = null;
        LocalDate maxDate = null;
        int skippedRows = 0;

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {

            String row;
            boolean headerSkipped = false;
            while ((row = reader.readLine()) != null) {
                if (row.isBlank()) continue;
                if (!headerSkipped) {
                    headerSkipped = true;
                    continue;
                }

                Optional<BankStatementLine> line = parseRow(row);
                if (line.isEmpty()) {
                    skippedRows++;
                    continue;
                }
                LocalDate txnDate = line.get().getTxnDate();
                if (minDate == null || txnDate.isBefore(minDate)) minDate = txnDate;
                if (maxDate == null || txnDate.isAfter(maxDate)) maxDate = txnDate;
                lines.add(line.get());
            }
        } catch (IOException ex) {
            log.warn("CSV read error for pump={}: {}", pumpId, ex.getMessage(), ex);
            throw new BusinessException("Failed to read the uploaded file. Ensure it is a valid CSV with the required columns.");
        }
        return new ParsedStatement(lines, skippedRows, minDate, maxDate);
    }

    private Optional<BankStatementLine> parseRow(String row) {
        List<String> cols = BankStatementCsv.splitLine(row).orElse(List.of());
        if (cols.size() < 4) {
            return Optional.empty();
        }

        LocalDate txnDate = parseDate(cols.get(0).trim());
        if (txnDate == null) {
            log.warn("Skipping CSV row — unparseable date: '{}'", cols.get(0));
            return Optional.empty();
        }

        Optional<BigDecimal> debit = BankStatementCsv.parseMoney(cols.get(2));
        Optional<BigDecimal> credit = BankStatementCsv.parseMoney(cols.get(3));
        if (debit.isEmpty() || credit.isEmpty()) {
            log.warn("Skipping CSV row dated {} — unparseable amount (debit='{}', credit='{}')",
                    txnDate, cols.get(2), cols.get(3));
            return Optional.empty();
        }

        String narration = cols.get(1).trim();
        String utr = cols.size() > 5 ? cols.get(5).trim() : null;
        return Optional.of(BankStatementLine.builder()
                .txnDate(txnDate)
                .narration(narration.isEmpty() ? null : narration)
                .debitAmount(debit.get())
                .creditAmount(credit.get())
                .balance(cols.size() > 4 ? BankStatementCsv.parseOptionalBalance(cols.get(4)) : null)
                .utrReference(utr != null && !utr.isEmpty() ? utr : null)
                .matchStatus(BankLineMatchStatus.UNMATCHED)
                .build());
    }

    private void requireOnPump(Long id, Predicate<Long> belongsToPump, String label) {
        if (id != null && !belongsToPump.test(id)) {
            throw new ResourceNotFoundException(label + " not found");
        }
    }

    private LocalDate parseDate(String raw) {
        for (DateTimeFormatter fmt : DATE_FORMATS) {
            try {
                return LocalDate.parse(raw, fmt);
            } catch (DateTimeParseException ignored) {
                // not this format; the next one is tried
            }
        }
        return null;
    }

    private Long extractLong(Map<String, Object> body, String key) {
        Object val = body.get(key);
        if (val == null) return null;
        if (val instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(val.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

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
