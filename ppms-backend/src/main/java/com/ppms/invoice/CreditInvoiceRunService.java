package com.ppms.invoice;

import com.ppms.credit.CreditClient;
import com.ppms.credit.CreditClientRepository;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Issues invoices for every client account of a pump, each in its own transaction (see
 * {@link CreditInvoiceService#issueInNewTransaction}), so one failing client is reported without losing the others.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CreditInvoiceRunService {

    private final CreditClientRepository clientRepository;
    private final CreditInvoiceService invoiceService;

    /**
     * @param invoicesIssued  clients that received an invoice
     * @param clientsSkipped  clients with nothing to bill in the period
     * @param failedClientIds clients whose invoice failed and was rolled back
     */
    public record InvoiceRunResult(int invoicesIssued, int clientsSkipped, List<Long> failedClientIds) {
        public int clientsFailed() {
            return failedClientIds.size();
        }
    }

    public InvoiceRunResult issueForAllClients(Long pumpId, LocalDate periodFrom, LocalDate periodTo, User issuedBy) {
        invoiceService.requirePumpWithGstDetails(pumpId);
        invoiceService.validatePeriod(periodFrom, periodTo);

        int issued = 0;
        int skipped = 0;
        List<Long> failedClientIds = new ArrayList<>();
        for (CreditClient client : clientRepository.findByPumpIdOrderByNameAsc(pumpId)) {
            try {
                if (invoiceService.issueInNewTransaction(pumpId, client.getId(), periodFrom, periodTo, issuedBy).isPresent()) {
                    issued++;
                } else {
                    skipped++;
                }
            } catch (RuntimeException e) {
                log.error("Invoice failed for pump={} client={} period={}..{}: {}",
                        pumpId, client.getId(), periodFrom, periodTo, e.getMessage(), e);
                failedClientIds.add(client.getId());
            }
        }
        log.info("Invoices issued for pump={} period={}..{}: issued={}, skipped={}, failed={}",
                pumpId, periodFrom, periodTo, issued, skipped, failedClientIds.size());
        return new InvoiceRunResult(issued, skipped, failedClientIds);
    }
}
