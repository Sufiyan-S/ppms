package com.ppms.invoice;

import com.ppms.common.time.BusinessClock;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/** Printable HTML for a credit invoice, built only from the invoice's own snapshot. */
@Component
@RequiredArgsConstructor
public class CreditInvoiceRenderer {

    private final BusinessClock businessClock;

    public String render(CreditInvoice invoice, List<CreditInvoiceLine> lines) {
        List<CreditInvoiceLine> fuelLines = lines.stream()
                .filter(line -> line.getLineType() == InvoiceLineType.FUEL).toList();
        List<CreditInvoiceLine> ancillaryLines = lines.stream()
                .filter(line -> line.getLineType() == InvoiceLineType.ANCILLARY).toList();
        boolean interState = !invoice.getSellerStateCode().equals(invoice.getPlaceOfSupplyStateCode());
        boolean cancelled = invoice.getStatus() == CreditInvoiceStatus.CANCELLED;

        StringBuilder sb = new StringBuilder();
        appendDocumentHead(sb, invoice);
        if (cancelled) {
            sb.append("<div class='watermark'>CANCELLED</div>");
        }
        appendSeller(sb, invoice, ancillaryLines.isEmpty() ? "INVOICE" : "TAX INVOICE");
        appendInvoiceAndBuyer(sb, invoice);
        if (cancelled) {
            sb.append("<p class='cancelled-note'><strong>Cancelled on ")
                    .append(invoice.getCancelledAt().atZoneSameInstant(businessClock.zone()).toLocalDate())
                    .append(":</strong> ").append(escapeHtml(invoice.getCancelReason())).append("</p>");
        }
        if (!fuelLines.isEmpty()) {
            appendFuelTable(sb, fuelLines, invoice.getFuelTotal());
        }
        if (!ancillaryLines.isEmpty()) {
            appendAncillaryTable(sb, ancillaryLines, interState);
        }
        appendTotals(sb, invoice, interState);

        sb.append("<div class='no-print'><button onclick='window.print()' ")
                .append("style='padding:8px 20px;font-size:13px;cursor:pointer;'>Print Invoice</button></div>");
        sb.append("</body></html>");
        return sb.toString();
    }

    private void appendDocumentHead(StringBuilder sb, CreditInvoice invoice) {
        sb.append("""
                <!DOCTYPE html>
                <html lang="en">
                <head>
                <meta charset="UTF-8"/>
                <meta name="viewport" content="width=device-width, initial-scale=1"/>
                <title>Invoice %s</title>
                <style>
                  body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #333; position: relative; }
                  h1 { font-size: 18px; margin: 0; }
                  h2 { font-size: 14px; margin: 4px 0; color: #555; }
                  h3 { font-size: 13px; margin: 16px 0 4px; }
                  .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 16px; }
                  .doc-title { text-align: center; font-size: 15px; font-weight: bold; letter-spacing: 1px; margin: 8px 0; }
                  .meta-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
                  .meta-block p { margin: 2px 0; }
                  .table-wrap { overflow-x: auto; }
                  table { width: 100%%; border-collapse: collapse; margin-top: 6px; }
                  th { background: #f0f0f0; border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 11px; }
                  td { border: 1px solid #ddd; padding: 5px 8px; font-size: 11px; vertical-align: top; }
                  .amount { text-align: right; font-family: monospace; white-space: nowrap; }
                  .note { color: #666; font-size: 11px; margin: 4px 0; }
                  .totals { margin-top: 16px; margin-left: auto; max-width: 360px; }
                  .totals td { border: none; padding: 3px 8px; }
                  .grand td { border-top: 2px solid #333; font-weight: bold; font-size: 13px; }
                  .cancelled-note { color: #b00020; }
                  .watermark { position: fixed; top: 40%%; left: 0; right: 0; text-align: center; font-size: 96px;
                               font-weight: bold; color: rgba(176, 0, 32, 0.15); transform: rotate(-30deg); pointer-events: none; }
                  .no-print { margin-top: 20px; }
                  @media print { .no-print { display: none; } }
                </style>
                </head>
                <body>
                """.formatted(escapeHtml(invoice.getInvoiceNumber())));
    }

    private void appendSeller(StringBuilder sb, CreditInvoice invoice, String documentTitle) {
        sb.append("<div class='header'>")
                .append("<h1>").append(escapeHtml(invoice.getSellerTradeName())).append("</h1>")
                .append("<h2>").append(escapeHtml(invoice.getSellerLegalName())).append("</h2>")
                .append("<p>").append(escapeHtml(invoice.getSellerAddress())).append("</p>")
                .append("<p><strong>GSTIN:</strong> ").append(escapeHtml(invoice.getSellerGstin()))
                .append(" &nbsp; <strong>State:</strong> ")
                .append(escapeHtml(invoice.getSellerStateName() != null
                        ? invoice.getSellerStateCode() + " – " + invoice.getSellerStateName()
                        : GstStateCodes.describe(invoice.getSellerStateCode())))
                .append("</p>")
                .append("<div class='doc-title'>").append(documentTitle).append("</div>")
                .append("</div>");
    }

    private void appendInvoiceAndBuyer(StringBuilder sb, CreditInvoice invoice) {
        sb.append("<div class='meta-row'>")
                .append("<div class='meta-block'>")
                .append("<p><strong>Bill to:</strong> ").append(escapeHtml(invoice.getBuyerName())).append("</p>");
        if (invoice.getBuyerAddress() != null) {
            sb.append("<p>").append(escapeHtml(invoice.getBuyerAddress())).append("</p>");
        }
        sb.append("<p><strong>GSTIN:</strong> ")
                .append(invoice.getBuyerGstin() != null ? escapeHtml(invoice.getBuyerGstin()) : "Unregistered")
                .append("</p>")
                .append("</div>")
                .append("<div class='meta-block'>")
                .append("<p><strong>Invoice No:</strong> ").append(escapeHtml(invoice.getInvoiceNumber())).append("</p>")
                .append("<p><strong>Invoice Date:</strong> ").append(invoice.getIssuedOn()).append("</p>")
                .append("<p><strong>Period:</strong> ").append(invoice.getPeriodFrom())
                .append(" to ").append(invoice.getPeriodTo()).append("</p>")
                .append("<p><strong>Place of Supply:</strong> ")
                .append(escapeHtml(GstStateCodes.describe(invoice.getPlaceOfSupplyStateCode()))).append("</p>")
                .append("</div></div>");
    }

    private void appendFuelTable(StringBuilder sb, List<CreditInvoiceLine> fuelLines, BigDecimal fuelTotal) {
        sb.append("<h3>Fuel</h3>")
                .append("<p class='note'>Petrol and diesel are outside GST (VAT included in the price).</p>")
                .append("<div class='table-wrap'><table><thead><tr>")
                .append("<th>Date</th><th>Bill No</th><th>Description</th><th>Vehicle</th>")
                .append("<th class='amount'>Amount (₹)</th>")
                .append("</tr></thead><tbody>");
        for (CreditInvoiceLine line : fuelLines) {
            sb.append("<tr>")
                    .append("<td>").append(line.getSaleDate()).append("</td>")
                    .append("<td>").append(escapeHtml(line.getBillNo())).append("</td>")
                    .append("<td>").append(escapeHtml(line.getDescription())).append("</td>")
                    .append("<td>").append(escapeHtml(line.getVehicleRegistration())).append("</td>")
                    .append("<td class='amount'>").append(money(line.getLineTotal())).append("</td>")
                    .append("</tr>");
        }
        sb.append("<tr><td colspan='4'><strong>Fuel total (outside GST)</strong></td>")
                .append("<td class='amount'><strong>").append(money(fuelTotal)).append("</strong></td></tr>")
                .append("</tbody></table></div>");
    }

    private void appendAncillaryTable(StringBuilder sb, List<CreditInvoiceLine> ancillaryLines, boolean interState) {
        sb.append("<h3>Lubricants and other products</h3>")
                .append("<div class='table-wrap'><table><thead><tr>")
                .append("<th>Date</th><th>Bill No</th><th>Description</th><th>HSN</th>")
                .append("<th class='amount'>Qty</th><th class='amount'>Rate (₹)</th>")
                .append("<th class='amount'>Taxable (₹)</th><th class='amount'>GST %</th>");
        if (interState) {
            sb.append("<th class='amount'>IGST (₹)</th>");
        } else {
            sb.append("<th class='amount'>CGST (₹)</th><th class='amount'>SGST (₹)</th>");
        }
        sb.append("<th class='amount'>Total (₹)</th></tr></thead><tbody>");
        for (CreditInvoiceLine line : ancillaryLines) {
            sb.append("<tr>")
                    .append("<td>").append(line.getSaleDate()).append("</td>")
                    .append("<td>").append(escapeHtml(line.getBillNo())).append("</td>")
                    .append("<td>").append(escapeHtml(line.getDescription())).append("</td>")
                    .append("<td>").append(escapeHtml(line.getHsnCode())).append("</td>")
                    .append("<td class='amount'>").append(line.getQuantity()).append("</td>")
                    .append("<td class='amount'>").append(money(line.getRate())).append("</td>")
                    .append("<td class='amount'>").append(money(line.getTaxableValue())).append("</td>")
                    .append("<td class='amount'>").append(money(line.getGstRate())).append("</td>");
            if (interState) {
                sb.append("<td class='amount'>").append(money(line.getIgst())).append("</td>");
            } else {
                sb.append("<td class='amount'>").append(money(line.getCgst())).append("</td>")
                        .append("<td class='amount'>").append(money(line.getSgst())).append("</td>");
            }
            sb.append("<td class='amount'>").append(money(line.getLineTotal())).append("</td>").append("</tr>");
        }
        sb.append("</tbody></table></div>");
    }

    private void appendTotals(StringBuilder sb, CreditInvoice invoice, boolean interState) {
        sb.append("<table class='totals'><tbody>");
        appendTotalRow(sb, "Fuel (outside GST)", invoice.getFuelTotal());
        appendTotalRow(sb, "Taxable value", invoice.getTaxableTotal());
        if (interState) {
            appendTotalRow(sb, "IGST", invoice.getIgstTotal());
        } else {
            appendTotalRow(sb, "CGST", invoice.getCgstTotal());
            appendTotalRow(sb, "SGST", invoice.getSgstTotal());
        }
        sb.append("<tr class='grand'><td>Grand total (₹)</td><td class='amount'>")
                .append(money(invoice.getGrandTotal())).append("</td></tr>")
                .append("</tbody></table>");
    }

    private void appendTotalRow(StringBuilder sb, String label, BigDecimal amount) {
        sb.append("<tr><td>").append(label).append("</td><td class='amount'>")
                .append(money(amount)).append("</td></tr>");
    }

    private String money(BigDecimal amount) {
        return amount == null ? "" : amount.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private String escapeHtml(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
