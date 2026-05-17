package com.ppms.credit;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.dto.PagedResponse;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/pumps/{pumpId}/credit-ledger")
@RequiredArgsConstructor
public class CreditLedgerController {

    private final CreditClientAccessService clientAccessService;
    private final CreditInterestService interestService;
    private final CreditLedgerService ledgerService;
    private final CreditLedgerQueryService queryService;
    private final CreditStatementRenderer statementRenderer;
    private final PumpLocationRepository pumpLocationRepository;
    private final AuditService auditService;

    /**
     * GET /api/pumps/{pumpId}/credit-ledger
     * Returns all credit clients for the pump with their current outstanding balance.
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT')")
    public ResponseEntity<List<CreditClientResponse>> getLedgerSummary(@PathVariable Long pumpId) {
        return ResponseEntity.ok(queryService.getLedgerSummary(pumpId));
    }

    /**
     * GET /api/pumps/{pumpId}/credit-ledger/{clientId}/transactions?page=0&size=50
     * Returns a paginated ledger for a client — credit sales interleaved with payments
     * and interest charges, with a running balance.
     *
     * Note: running balance is computed across ALL transactions before pagination so the
     * balance values on each page are always correct relative to the full history.
     */
    @GetMapping("/{clientId}/transactions")
    public ResponseEntity<PagedResponse<CreditTransactionResponse>> getTransactions(
            @PathVariable Long pumpId,
            @PathVariable Long clientId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        clientAccessService.requireClientForPump(pumpId, clientId);
        return ResponseEntity.ok(queryService.getTransactions(clientId, page, size));
    }

    /**
     * POST /api/pumps/{pumpId}/credit-ledger/{clientId}/payments
     * Records a payment settlement against the client's outstanding balance.
     * Owner/Admin only.
     *
     * Bug 10: @Transactional moved to CreditLedgerService.recordPayment().
     * Bug 1: overpayment guard now uses combined outstanding for parent accounts.
     */
    @PostMapping("/{clientId}/payments")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<CreditPaymentResponse> recordPayment(
            @PathVariable Long pumpId,
            @PathVariable Long clientId,
            @Valid @RequestBody RecordPaymentRequest request,
            @AuthenticationPrincipal User currentUser) {

        CreditPayment payment = ledgerService.recordPayment(pumpId, clientId, request, currentUser);

        auditService.log(pumpId, AuditAction.CREDIT_PAYMENT_RECEIVED,
                "CreditPayment", payment.getId().toString(),
                "Payment ₹" + payment.getAmount() + " (" + payment.getPaymentMode() + ") for clientId=" + clientId,
                currentUser);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(queryService.toPaymentResponse(payment, currentUser.getFullName()));
    }

    /**
     * GET /api/pumps/{pumpId}/credit-ledger/{clientId}/payments
     * Returns all payment records for a client, newest first.
     */
    @GetMapping("/{clientId}/payments")
    public ResponseEntity<List<CreditPaymentResponse>> getPayments(
            @PathVariable Long pumpId,
            @PathVariable Long clientId) {
        clientAccessService.requireClientForPump(pumpId, clientId);
        return ResponseEntity.ok(queryService.getPayments(clientId));
    }

    /**
     * PATCH /api/pumps/{pumpId}/credit-ledger/clients/{clientId}/credit-limit
     * Updates the credit limit for a client. 0 = no limit.
     *
     * Bug 4: toClientResponse() N+1 fixed by pre-loading all pump clients in one query.
     */
    @PatchMapping("/clients/{clientId}/credit-limit")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<CreditClientResponse> updateCreditLimit(
            @PathVariable Long pumpId,
            @PathVariable Long clientId,
            @Valid @RequestBody UpdateCreditLimitRequest request,
            @AuthenticationPrincipal User currentUser) {

        CreditClient client = clientAccessService.requireClientForPump(pumpId, clientId);

        BigDecimal oldLimit = client.getCreditLimit();
        client.setCreditLimit(request.getCreditLimit().setScale(2, RoundingMode.HALF_UP));
        client = ledgerService.saveClient(client);

        log.info("Credit limit updated: pump={}, client={}, newLimit={}", pumpId, clientId, client.getCreditLimit());

        auditService.log(pumpId, AuditAction.CREDIT_LIMIT_CHANGED,
                "CreditClient", clientId.toString(),
                "Credit limit for " + client.getName() + " changed from ₹" + oldLimit + " to ₹" + client.getCreditLimit(),
                currentUser);

        return ResponseEntity.ok(queryService.toClientResponse(client, clientAccessService.loadPumpClients(pumpId)));
    }

    /**
     * PATCH /api/pumps/{pumpId}/credit-ledger/clients/{clientId}/interest-settings
     * Updates monthly interest rate and grace days for a client. Owner/Admin only.
     *
     * Bug 4: toClientResponse() N+1 fixed by pre-loading all pump clients in one query.
     */
    @PatchMapping("/clients/{clientId}/interest-settings")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<CreditClientResponse> updateInterestSettings(
            @PathVariable Long pumpId,
            @PathVariable Long clientId,
            @Valid @RequestBody UpdateInterestSettingsRequest request) {

        CreditClient client = clientAccessService.requireClientForPump(pumpId, clientId);

        client.setMonthlyInterestRate(request.monthlyInterestRate().setScale(2, RoundingMode.HALF_UP));
        client.setInterestGraceDays(request.interestGraceDays());
        client = ledgerService.saveClient(client);

        log.info("Interest settings updated: pump={}, client={}, rate={}%, graceDays={}",
                pumpId, clientId, client.getMonthlyInterestRate(), client.getInterestGraceDays());

        return ResponseEntity.ok(queryService.toClientResponse(client, clientAccessService.loadPumpClients(pumpId)));
    }

    /**
     * POST /api/pumps/{pumpId}/credit-ledger/{clientId}/interest/apply
     * Applies pro-rata interest for a single client up to today. Owner/Admin only.
     *
     * Bug 10: @Transactional is on CreditInterestService.applyProRata(), not here.
     */
    @PostMapping("/{clientId}/interest/apply")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<Map<String, Object>> applyInterest(
            @PathVariable Long pumpId,
            @PathVariable Long clientId,
            @AuthenticationPrincipal User currentUser) {

        clientAccessService.requireClientForPump(pumpId, clientId);

        return interestService.applyProRata(pumpId, clientId, currentUser.getId())
                .map(charge -> ResponseEntity.ok(Map.<String, Object>of(
                        "applied", true,
                        "amount", charge.getAmount(),
                        "days", charge.getDaysApplied(),
                        "periodFrom", charge.getPeriodFrom().toString(),
                        "periodTo", charge.getPeriodTo().toString()
                )))
                .orElseGet(() -> ResponseEntity.ok(Map.of("applied", false,
                        "reason", "No eligible interest period — client may have no balance, no rate configured, or interest was already applied recently.")));
    }

    /**
     * POST /api/pumps/{pumpId}/credit-ledger/interest/apply-all
     * Applies pro-rata interest to ALL eligible clients for the pump. Owner/Admin only.
     *
     * Bug 10: @Transactional is on CreditInterestService.applyProRataForAllClients(), not here.
     */
    @PostMapping("/interest/apply-all")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<Map<String, Object>> applyInterestForAll(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {

        CreditInterestService.InterestApplicationResult result =
                interestService.applyProRataForAllClients(pumpId, currentUser.getId());
        return ResponseEntity.ok(Map.of(
                "clientsCharged",    result.charged(),
                "clientsSkipped",    result.skipped(),
                "clientsFailed",     result.failed(),
                "failedClientIds",   result.failedClientIds()
        ));
    }

    /**
     * GET /api/pumps/{pumpId}/credit-ledger/{clientId}/interest/total-recovered
     * Returns the total interest ever charged to this client and all its sub-accounts.
     * For standalone or sub-accounts, returns only the client's own interest total.
     */
    @GetMapping("/{clientId}/interest/total-recovered")
    public ResponseEntity<Map<String, Object>> getTotalInterestRecovered(
            @PathVariable Long pumpId,
            @PathVariable Long clientId) {
        clientAccessService.requireClientForPump(pumpId, clientId);

        BigDecimal total = interestService.computeTotalInterestRecovered(clientId);
        return ResponseEntity.ok(Map.of("totalInterestRecovered", total));
    }

    /**
     * DELETE /api/pumps/{pumpId}/credit-ledger/{clientId}/interest/{chargeId}
     * Permanently removes an interest charge from the ledger. Owner/Admin only.
     *
     * Bug 10: @Transactional moved to CreditLedgerService.deleteInterestCharge().
     */
    @DeleteMapping("/{clientId}/interest/{chargeId}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<Void> deleteInterestCharge(
            @PathVariable Long pumpId,
            @PathVariable Long clientId,
            @PathVariable Long chargeId,
            @AuthenticationPrincipal User currentUser) {

        ledgerService.deleteInterestCharge(pumpId, clientId, chargeId, currentUser);
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /api/pumps/{pumpId}/credit-ledger/entries/{entryId}/reassign
     * Moves a credit entry from its current account to a different account. Owner/Admin only.
     *
     * Bug 6: audit trail no longer stores from==to for previously unlinked entries.
     * Bug 10: @Transactional moved to CreditLedgerService.reassignCreditEntry().
     */
    @PostMapping("/entries/{entryId}/reassign")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<Void> reassignCreditEntry(
            @PathVariable Long pumpId,
            @PathVariable Long entryId,
            @Valid @RequestBody ReassignCreditEntryRequest request,
            @AuthenticationPrincipal User currentUser) {

        ledgerService.reassignCreditEntry(pumpId, entryId, request, currentUser);
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /api/pumps/{pumpId}/credit-ledger/payments/{paymentId}/reassign
     * Moves a recorded payment to another account within the same parent/sub-account group.
     * Owner/Admin only.
     */
    @PostMapping("/payments/{paymentId}/reassign")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<Void> reassignCreditPayment(
            @PathVariable Long pumpId,
            @PathVariable Long paymentId,
            @Valid @RequestBody ReassignCreditEntryRequest request,
            @AuthenticationPrincipal User currentUser) {

        ledgerService.reassignCreditPayment(pumpId, paymentId, request, currentUser);
        auditService.log(pumpId, AuditAction.CREDIT_ENTRY_REASSIGNED,
                "CreditPayment", paymentId.toString(),
                "Payment moved to clientId=" + request.getToClientId() + " reason=" + request.getReason().trim(),
                currentUser);
        return ResponseEntity.noContent().build();
    }

    /**
     * GET /api/pumps/{pumpId}/credit-ledger/{clientId}/statement
     *
     * Returns an HTML credit account statement for the client, ready for browser printing.
     * The frontend opens this in a new tab and calls window.print().
     *
     * Optional query params:
     *   fromDate (ISO date, e.g. 2024-01-01) — filter transactions from this date
     *   toDate   (ISO date, e.g. 2024-12-31) — filter transactions up to this date
     *
     * The statement includes: pump header, client details, transaction table with running
     * balance, and the current outstanding balance as a footer summary.
     */
    @GetMapping(value = "/{clientId}/statement", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> getCreditStatement(
            @PathVariable Long pumpId,
            @PathVariable Long clientId,
            @RequestParam(required = false) LocalDate fromDate,
            @RequestParam(required = false) LocalDate toDate) {

        CreditClient client = clientAccessService.requireClientForPump(pumpId, clientId);

        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found"));

        BigDecimal outstanding = interestService.computeOutstanding(clientId);
        String html = statementRenderer.render(
                pump,
                client,
                queryService.getStatementTransactions(clientId, fromDate, toDate),
                outstanding,
                fromDate,
                toDate);

        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .body(html);
    }

    /**
     * GET /api/pumps/{pumpId}/credit-ledger/payments/pending
     * Returns all credit payments awaiting Owner/Admin approval for this pump.
     * Only OWNER or ADMIN may view and act on the approval queue.
     */
    @GetMapping("/payments/pending")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<List<CreditPaymentResponse>> getPendingPayments(
            @PathVariable Long pumpId) {
        return ResponseEntity.ok(queryService.getPendingPayments(pumpId));
    }

    /**
     * PATCH /api/pumps/{pumpId}/credit-ledger/payments/{paymentId}/approve
     * Approves or rejects a PENDING_APPROVAL credit payment.
     * Accepted status values: APPROVED, REJECTED.
     * Once approved, the payment is counted in the client's outstanding balance.
     */
    @PatchMapping("/payments/{paymentId}/approve")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<CreditPaymentResponse> approvePayment(
            @PathVariable Long pumpId,
            @PathVariable Long paymentId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal User currentUser) {

        String statusStr = body.get("status");
        if (statusStr == null) {
            throw new BusinessException("status is required (APPROVED or REJECTED)");
        }

        com.ppms.expense.ExpenseApprovalStatus newStatus;
        try {
            newStatus = com.ppms.expense.ExpenseApprovalStatus.valueOf(statusStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("Invalid status. Allowed: APPROVED, REJECTED");
        }

        if (newStatus == com.ppms.expense.ExpenseApprovalStatus.PENDING_APPROVAL) {
            throw new BusinessException("Cannot set status back to PENDING_APPROVAL");
        }

        CreditPayment saved = ledgerService.approvePayment(pumpId, paymentId, newStatus, currentUser);

        log.info("Credit payment {}: paymentId={} pump={} amount={} by={}",
                newStatus, paymentId, pumpId, saved.getAmount(), currentUser.getId());

        auditService.log(pumpId, AuditAction.CREDIT_PAYMENT_RECEIVED,
                "CreditPayment", paymentId.toString(),
                "Payment " + newStatus + ": ₹" + saved.getAmount() + " for clientId=" + saved.getClientId(),
                currentUser);
        String recordedByName = ledgerService.resolveRecordedByName(saved.getRecordedById());
        return ResponseEntity.ok(queryService.toPaymentResponse(saved, recordedByName));
    }
}
