package com.ppms.invoice;

import java.math.BigDecimal;

/**
 * What generating invoices for every client would issue for the period, without issuing anything.
 *
 * @param gstDetailsComplete false when the pump has no GSTIN, legal name or invoice prefix yet, so nothing can be issued
 */
public record InvoiceRunPreview(int clientsToInvoice, BigDecimal totalAmount, boolean gstDetailsComplete) {
}
