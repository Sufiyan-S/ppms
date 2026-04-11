package com.ppms.report;

import com.ppms.common.dto.PagedResponse;
import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

/**
 * REST controller for balance sheet generation and retrieval.
 *
 * All endpoints are scoped to a specific pump: /api/pumps/{pumpId}/balance-sheets
 *
 * Access: MANAGER, ADMIN, OWNER — operators do not have access to financial reports.
 */
@Slf4j
@RestController
@RequestMapping("/api/pumps/{pumpId}/balance-sheets")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('MANAGER', 'ADMIN', 'OWNER')")
public class BalanceSheetController {

    private final BalanceSheetService balanceSheetService;

    /**
     * POST /api/pumps/{pumpId}/balance-sheets/generate
     *
     * Generates and persists a new balance sheet for the given pump.
     *
     * For SHIFT reports: reportType=SHIFT and shiftWindow (SHIFT_1, SHIFT_2, SHIFT_3) are required.
     * For DAY reports: reportType=DAY; shiftWindow is ignored.
     *
     * The service will reject the request if:
     * - No closed shifts exist for the requested date/window
     * - A report for the same date/window already exists (delete first to regenerate)
     *
     * Returns 201 CREATED with the full balance sheet detail.
     */
    @PostMapping("/generate")
    public ResponseEntity<BalanceSheetDetailResponse> generate(
            @PathVariable Long pumpId,
            @Valid @RequestBody GenerateBalanceSheetRequest request,
            @AuthenticationPrincipal User currentUser) {

        log.info("Balance sheet generation requested: pump={}, type={}, date={}, shiftDefinitionId={}, by={}",
                pumpId, request.getReportType(), request.getReportDate(),
                request.getShiftDefinitionId(), currentUser.getId());

        BalanceSheetDetailResponse response = balanceSheetService.generate(pumpId, request, currentUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * GET /api/pumps/{pumpId}/balance-sheets?page=0&size=20
     *
     * Lists balance sheets for a pump, newest first.
     * Supports optional date-range filtering via ?from=YYYY-MM-DD&to=YYYY-MM-DD
     * Default page size is 20 — balance sheet list is shown in a narrow side panel.
     *
     * Returns a summary list (no fuel/shift line detail) suitable for a history table.
     * Use the detail endpoint to fetch full breakdown for a selected report.
     */
    @GetMapping
    public ResponseEntity<PagedResponse<BalanceSheetSummaryResponse>> list(
            @PathVariable Long pumpId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        return ResponseEntity.ok(balanceSheetService.list(pumpId, from, to, PageRequest.of(page, size)));
    }

    /**
     * GET /api/pumps/{pumpId}/balance-sheets/{id}
     *
     * Returns the full detail of a balance sheet including:
     * - Header totals (cash, credit, discrepancy, profit)
     * - Per-fuel-type lines (stock, sold litres, revenue, COGS, profit)
     * - Per-shift lines (operator, nozzle, collected amounts, discrepancy)
     *
     * Returns 404 if the report does not exist or does not belong to this pump.
     */
    @GetMapping("/{id}")
    public ResponseEntity<BalanceSheetDetailResponse> getById(
            @PathVariable Long pumpId,
            @PathVariable Long id) {

        return ResponseEntity.ok(balanceSheetService.getById(pumpId, id));
    }

    /**
     * DELETE /api/pumps/{pumpId}/balance-sheets/{id}
     *
     * Deletes a balance sheet and all its child lines.
     * This is typically done before regenerating a report for the same period.
     *
     * Returns 204 NO CONTENT on success.
     * Returns 404 if the report does not exist or does not belong to this pump.
     *
     * Access: OWNER and ADMIN only — managers can view but not delete reports.
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'OWNER')")
    public ResponseEntity<Void> delete(
            @PathVariable Long pumpId,
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {

        log.info("Balance sheet delete requested: pump={}, id={}, by={}", pumpId, id, currentUser.getId());
        balanceSheetService.delete(pumpId, id);
        return ResponseEntity.noContent().build();
    }
}
