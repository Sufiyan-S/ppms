package com.ppms.invoice;

import com.ppms.common.dto.PagedResponse;
import com.ppms.credit.CreditLedgerController;
import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/pumps/{pumpId}/credit-invoices")
@RequiredArgsConstructor
public class CreditInvoiceController {

    private final CreditInvoiceService invoiceService;
    private final CreditInvoiceRunService invoiceRunService;
    private final CreditInvoiceRenderer invoiceRenderer;

    /** GET /api/pumps/{pumpId}/credit-invoices?clientId=&page=0&size=50 — newest first. */
    @GetMapping
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT')")
    public ResponseEntity<PagedResponse<CreditInvoiceResponse>> listInvoices(
            @PathVariable Long pumpId,
            @RequestParam(required = false) Long clientId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(invoiceService.listInvoices(pumpId, clientId, page, size));
    }

    /** GET /api/pumps/{pumpId}/credit-invoices/default-period?clientId= — the client's last completed billing cycle. */
    @GetMapping("/default-period")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT')")
    public ResponseEntity<InvoicePeriod> getDefaultPeriod(@PathVariable Long pumpId, @RequestParam Long clientId) {
        return ResponseEntity.ok(invoiceService.defaultPeriod(pumpId, clientId));
    }

    @GetMapping("/{invoiceId}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT')")
    public ResponseEntity<CreditInvoiceDetailResponse> getInvoice(@PathVariable Long pumpId, @PathVariable Long invoiceId) {
        CreditInvoice invoice = invoiceService.requireInvoiceForPump(pumpId, invoiceId);
        return ResponseEntity.ok(CreditInvoiceDetailResponse.from(invoice, invoiceService.linesOf(invoice)));
    }

    /** GET /api/pumps/{pumpId}/credit-invoices/{invoiceId}/print — printable HTML, opened in a new tab. */
    @GetMapping(value = "/{invoiceId}/print", produces = MediaType.TEXT_HTML_VALUE)
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT')")
    public ResponseEntity<String> printInvoice(@PathVariable Long pumpId, @PathVariable Long invoiceId) {
        CreditInvoice invoice = invoiceService.requireInvoiceForPump(pumpId, invoiceId);
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .header("Content-Security-Policy", CreditLedgerController.STATEMENT_CONTENT_SECURITY_POLICY)
                .body(invoiceRenderer.render(invoice, invoiceService.linesOf(invoice)));
    }

    /** POST /api/pumps/{pumpId}/credit-invoices — issues one client's invoice for the period. */
    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<CreditInvoiceResponse> generateInvoice(
            @PathVariable Long pumpId,
            @Valid @RequestBody GenerateCreditInvoiceRequest request,
            @AuthenticationPrincipal User currentUser) {
        CreditInvoice invoice = invoiceService.issue(
                pumpId, request.clientId(), request.periodFrom(), request.periodTo(), currentUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(CreditInvoiceResponse.from(invoice));
    }

    /** POST /api/pumps/{pumpId}/credit-invoices/generate-all — one invoice per client with something to bill. */
    @PostMapping("/generate-all")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<Map<String, Object>> generateInvoicesForAllClients(
            @PathVariable Long pumpId,
            @Valid @RequestBody GenerateAllCreditInvoicesRequest request,
            @AuthenticationPrincipal User currentUser) {
        CreditInvoiceRunService.InvoiceRunResult result = invoiceRunService.issueForAllClients(
                pumpId, request.periodFrom(), request.periodTo(), currentUser);
        return ResponseEntity.ok(Map.of(
                "invoicesIssued", result.invoicesIssued(),
                "clientsSkipped", result.clientsSkipped(),
                "clientsFailed", result.clientsFailed(),
                "failedClientIds", result.failedClientIds()));
    }

    /** POST /api/pumps/{pumpId}/credit-invoices/{invoiceId}/cancel — keeps the invoice and its number, frees its sales. */
    @PostMapping("/{invoiceId}/cancel")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ResponseEntity<CreditInvoiceResponse> cancelInvoice(
            @PathVariable Long pumpId,
            @PathVariable Long invoiceId,
            @Valid @RequestBody CancelCreditInvoiceRequest request,
            @AuthenticationPrincipal User currentUser) {
        CreditInvoice invoice = invoiceService.cancel(pumpId, invoiceId, request.reason(), currentUser);
        return ResponseEntity.ok(CreditInvoiceResponse.from(invoice));
    }
}
