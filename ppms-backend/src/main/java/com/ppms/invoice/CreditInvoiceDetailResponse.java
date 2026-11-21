package com.ppms.invoice;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record CreditInvoiceDetailResponse(CreditInvoiceResponse invoice, List<Line> lines) {

    public record Line(
            Long id,
            String lineType,
            Long sourceId,
            LocalDate saleDate,
            String billNo,
            String description,
            String vehicleRegistration,
            String hsnCode,
            Integer quantity,
            BigDecimal rate,
            BigDecimal taxableValue,
            BigDecimal gstRate,
            BigDecimal cgst,
            BigDecimal sgst,
            BigDecimal igst,
            BigDecimal lineTotal
    ) {

        static Line from(CreditInvoiceLine line) {
            return new Line(line.getId(), line.getLineType().name(), line.getSourceId(), line.getSaleDate(),
                    line.getBillNo(), line.getDescription(), line.getVehicleRegistration(), line.getHsnCode(),
                    line.getQuantity(), line.getRate(), line.getTaxableValue(), line.getGstRate(),
                    line.getCgst(), line.getSgst(), line.getIgst(), line.getLineTotal());
        }
    }

    public static CreditInvoiceDetailResponse from(CreditInvoice invoice, List<CreditInvoiceLine> lines) {
        return new CreditInvoiceDetailResponse(CreditInvoiceResponse.from(invoice), lines.stream().map(Line::from).toList());
    }
}
