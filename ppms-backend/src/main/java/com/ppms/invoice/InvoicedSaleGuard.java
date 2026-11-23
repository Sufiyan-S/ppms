package com.ppms.invoice;

import java.util.Map;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ErrorCodes;
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
            throw new BusinessException(ErrorCodes.SALE_ALREADY_INVOICED,
                    Map.of("invoiceNumbers", String.join(", ", invoiceNumbers)),
                    "This sale is on invoice " + String.join(", ", invoiceNumbers)
                    + ". Cancel the invoice first.");
        }
    }
}
