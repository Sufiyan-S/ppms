package com.ppms.invoice;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

public record CreditInvoiceResponse(
        Long id,
        Long pumpId,
        Long clientId,
        String invoiceNumber,
        String financialYear,
        LocalDate periodFrom,
        LocalDate periodTo,
        LocalDate issuedOn,
        String sellerLegalName,
        String sellerGstin,
        String buyerName,
        String buyerGstin,
        String placeOfSupplyStateCode,
        BigDecimal fuelTotal,
        BigDecimal taxableTotal,
        BigDecimal cgstTotal,
        BigDecimal sgstTotal,
        BigDecimal igstTotal,
        BigDecimal grandTotal,
        String status,
        String cancelReason,
        OffsetDateTime cancelledAt,
        OffsetDateTime createdAt
) {

    public static CreditInvoiceResponse from(CreditInvoice invoice) {
        return new CreditInvoiceResponse(
                invoice.getId(),
                invoice.getPumpId(),
                invoice.getClientId(),
                invoice.getInvoiceNumber(),
                invoice.getFinancialYear(),
                invoice.getPeriodFrom(),
                invoice.getPeriodTo(),
                invoice.getIssuedOn(),
                invoice.getSellerLegalName(),
                invoice.getSellerGstin(),
                invoice.getBuyerName(),
                invoice.getBuyerGstin(),
                invoice.getPlaceOfSupplyStateCode(),
                invoice.getFuelTotal(),
                invoice.getTaxableTotal(),
                invoice.getCgstTotal(),
                invoice.getSgstTotal(),
                invoice.getIgstTotal(),
                invoice.getGrandTotal(),
                invoice.getStatus().name(),
                invoice.getCancelReason(),
                invoice.getCancelledAt(),
                invoice.getCreatedAt());
    }
}
