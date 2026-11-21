package com.ppms.invoice;

import com.ppms.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.List;

/** Stops a sale on an issued invoice from being voided or moved, so the invoice keeps matching the books. */
@Service
@RequiredArgsConstructor
public class InvoicedSaleGuard {

    private final CreditInvoiceLineRepository lineRepository;

    public void requireFuelEntriesNotInvoiced(Collection<Long> creditEntryIds) {
        if (creditEntryIds.isEmpty()) {
            return;
        }
        List<String> invoiceNumbers = lineRepository.findActiveInvoiceNumbersOfSources(InvoiceLineType.FUEL, creditEntryIds);
        if (!invoiceNumbers.isEmpty()) {
            throw new BusinessException("This sale is on invoice " + String.join(", ", invoiceNumbers)
                    + ". Cancel the invoice first.");
        }
    }
}
