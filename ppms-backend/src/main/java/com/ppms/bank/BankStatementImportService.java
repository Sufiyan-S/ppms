package com.ppms.bank;

import com.ppms.ancillary.AncillarySaleRepository;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.credit.CreditPaymentRepository;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.shift.Shift;
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
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

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
    private final PumpLocationRepository pumpLocationRepository;
    private final BusinessClock businessClock;

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
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.STATEMENT_IMPORT, "Import not found"));

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
            throw new BusinessException(ErrorCodes.BANK_STATEMENT_FILE_EMPTY, Map.of(), "Uploaded file is empty");
        }
        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || !originalFilename.toLowerCase().endsWith(".csv")) {
            throw new BusinessException(ErrorCodes.BANK_STATEMENT_NOT_CSV, Map.of(), "Only CSV files are accepted");
        }

        ParsedStatement parsed = parse(pumpId, file);
        if (parsed.lines().isEmpty()) {
            throw new BusinessException(ErrorCodes.BANK_STATEMENT_NO_ROWS, Map.of(),
                    "No valid transaction rows found in the uploaded file. " +
                    "Ensure the CSV format is: Date, Narration, Debit, Credit, Balance, UTR");
        }

        pumpLocationRepository.findByIdForUpdate(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PUMP, "Pump not found: " + pumpId));
        String fileHash = sha256Hex(file);
        importRepository.findFirstByPumpIdAndFileHash(pumpId, fileHash).ifPresent(existing -> {
            throw new BusinessException(ErrorCodes.BANK_STATEMENT_ALREADY_IMPORTED,
                    Map.of("importedOn", existing.getImportedAt().atZoneSameInstant(businessClock.zone()).toLocalDate().toString(),
                           "fromDate", String.valueOf(existing.getStatementFromDate()),
                           "toDate", String.valueOf(existing.getStatementToDate())),
                    "This statement file was already imported on "
                    + existing.getImportedAt().atZoneSameInstant(businessClock.zone()).toLocalDate()
                    + " (" + existing.getStatementFromDate() + " to " + existing.getStatementToDate() + ").");
        });
        refuseAlreadyImportedUtrReferences(pumpId, parsed.lines());

        BankStatementImport statementImport = importRepository.save(BankStatementImport.builder()
                .pumpId(pumpId)
                .bankName(bankName.trim())
                .accountNumber(accountNumber != null ? accountNumber.trim() : null)
                .statementFromDate(parsed.from())
                .statementToDate(parsed.to())
                .totalLines(parsed.lines().size())
                .matchedLines(0)
                .fileHash(fileHash)
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

    /**
     * A bank's UTR identifies one transaction, so a line whose UTR is already on an earlier statement means the
     * statement overlaps one already imported. Lines without a UTR are not compared: two equal amounts on the same
     * day are common and cannot be told apart from a repeat.
     */
    private void refuseAlreadyImportedUtrReferences(Long pumpId, List<BankStatementLine> lines) {
        Set<String> utrReferences = lines.stream()
                .map(BankStatementLine::getUtrReference)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (utrReferences.isEmpty()) {
            return;
        }
        List<String> alreadyImported = lineRepository.findImportedUtrReferences(pumpId, utrReferences);
        if (!alreadyImported.isEmpty()) {
            throw new BusinessException(ErrorCodes.BANK_STATEMENT_UTR_ALREADY_IMPORTED,
                    Map.of("count", alreadyImported.size(),
                           "utrReferences", alreadyImported.stream().sorted().limit(3).collect(Collectors.joining(", ")) + (alreadyImported.size() > 3 ? ", …" : "")),
                    alreadyImported.size() + " line(s) of this statement were already imported (UTR "
                    + alreadyImported.stream().sorted().limit(3).collect(Collectors.joining(", "))
                    + (alreadyImported.size() > 3 ? ", …" : "")
                    + "). Export a statement that starts after the last import.");
        }
    }

    private String sha256Hex(MultipartFile file) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(file.getBytes()));
        } catch (IOException ex) {
            log.warn("CSV read error while hashing statement: {}", ex.getMessage(), ex);
            throw new BusinessException(ErrorCodes.BANK_STATEMENT_UNREADABLE,
                    Map.of(),
                    "Failed to read the uploaded file. Ensure it is a valid CSV with the required columns.");
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available on this JVM", ex);
        }
    }

    /**
     * MATCHED needs exactly one linked shift, sale or credit payment whose amount equals the line's credit amount,
     * or a note explaining the difference; a credit payment can be matched to one line only. UNMATCHED and IGNORED
     * lines keep no links.
     */
    @Transactional
    public StatementLineResponse updateLineMatch(Long pumpId, Long lineId, Map<String, Object> body) {
        BankStatementLine line = lineRepository.findById(lineId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.STATEMENT_LINE,
                        "Statement line not found"));

        BankStatementImport statementImport = importRepository.findById(line.getImportId())
                .filter(found -> found.getPumpId().equals(pumpId))
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.STATEMENT_LINE,
                        "Statement line not found"));

        String statusStr = (String) body.get("status");
        if (statusStr == null) throw new BusinessException(ErrorCodes.BANK_LINE_STATUS_REQUIRED,
                Map.of(),
                "status is required (MATCHED or IGNORED)");

        BankLineMatchStatus newStatus;
        try {
            newStatus = BankLineMatchStatus.valueOf(statusStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCodes.BANK_LINE_STATUS_INVALID,
                    Map.of(),
                    "Invalid status. Allowed: MATCHED, IGNORED, UNMATCHED");
        }

        Long matchedShiftId = null;
        Long matchedSaleId = null;
        Long matchedPaymentId = null;
        String matchNotes = (String) body.get("matchNotes");
        if (newStatus == BankLineMatchStatus.MATCHED) {
            matchedShiftId = extractLong(body, "matchedShiftId");
            matchedSaleId = extractLong(body, "matchedSaleId");
            matchedPaymentId = extractLong(body, "matchedPaymentId");
            long linkedCount = Stream.of(matchedShiftId, matchedSaleId, matchedPaymentId).filter(Objects::nonNull).count();
            if (linkedCount != 1) {
                throw new BusinessException(ErrorCodes.BANK_LINE_MATCH_TARGET_REQUIRED,
                        Map.of(),
                        "A matched line must be linked to exactly one shift, sale or credit payment.");
            }
            BigDecimal linkedAmount = linkedAmount(pumpId, matchedShiftId, matchedSaleId, matchedPaymentId);
            if (matchedPaymentId != null && lineRepository.existsByMatchedPaymentIdAndIdNot(matchedPaymentId, lineId)) {
                throw new BusinessException(ErrorCodes.BANK_LINE_PAYMENT_ALREADY_MATCHED,
                        Map.of("paymentId", matchedPaymentId),
                        "Credit payment #" + matchedPaymentId
                        + " is already matched to another bank line. Unmatch that line first.");
            }
            if (linkedAmount.compareTo(line.getCreditAmount()) != 0 && (matchNotes == null || matchNotes.isBlank())) {
                throw new BusinessException(ErrorCodes.BANK_LINE_AMOUNT_MISMATCH_NOTE_REQUIRED,
                        Map.of("lineAmount", line.getCreditAmount().toPlainString(),
                               "linkedAmount", linkedAmount.toPlainString()),
                        "The line's credit of ₹" + line.getCreditAmount()
                        + " does not equal the linked amount of ₹" + linkedAmount
                        + ". Add a note explaining the difference to match it anyway.");
            }
        }

        line.setMatchStatus(newStatus);
        line.setMatchedShiftId(matchedShiftId);
        line.setMatchedAncillarySaleId(matchedSaleId);
        line.setMatchedPaymentId(matchedPaymentId);
        line.setMatchNotes(matchNotes);
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
            throw new BusinessException(ErrorCodes.BANK_STATEMENT_UNREADABLE,
                    Map.of(),
                    "Failed to read the uploaded file. Ensure it is a valid CSV with the required columns.");
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

    /** Digital collections for a shift, the bill total for a sale, the amount for a credit payment. */
    private BigDecimal linkedAmount(Long pumpId, Long shiftId, Long saleId, Long paymentId) {
        if (shiftId != null) {
            Shift shift = shiftRepository.findById(shiftId)
                    .filter(found -> found.getPumpId().equals(pumpId))
                    .orElseThrow(() -> new ResourceNotFoundException(EntityType.SHIFT, "Shift not found"));
            return orZero(shift.getUpiCollected()).add(orZero(shift.getCardCollected()))
                    .add(orZero(shift.getFleetCardCollected())).setScale(2, RoundingMode.HALF_UP);
        }
        if (saleId != null) {
            return ancillarySaleRepository.findById(saleId)
                    .filter(found -> found.getPumpId().equals(pumpId))
                    .map(sale -> sale.getTotalWithGst().setScale(2, RoundingMode.HALF_UP))
                    .orElseThrow(() -> new ResourceNotFoundException(EntityType.SALE, "Sale not found"));
        }
        return creditPaymentRepository.findById(paymentId)
                .filter(found -> found.getPumpId().equals(pumpId))
                .map(payment -> payment.getAmount().setScale(2, RoundingMode.HALF_UP))
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PAYMENT, "Payment not found"));
    }

    private static BigDecimal orZero(BigDecimal amount) {
        return amount != null ? amount : BigDecimal.ZERO;
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
