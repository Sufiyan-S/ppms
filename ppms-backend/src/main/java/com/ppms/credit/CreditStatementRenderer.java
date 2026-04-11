package com.ppms.credit;

import com.ppms.pump.PumpLocation;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

@Component
public class CreditStatementRenderer {

    public String render(PumpLocation pump,
                         CreditClient client,
                         List<CreditTransactionResponse> transactions,
                         BigDecimal outstanding,
                         LocalDate fromDate,
                         LocalDate toDate) {
        StringBuilder sb = new StringBuilder();
        String periodLabel = (fromDate != null || toDate != null)
                ? "Period: " + (fromDate != null ? fromDate : "inception") + " to " + (toDate != null ? toDate : "today")
                : "All transactions";

        sb.append("""
                <!DOCTYPE html>
                <html lang="en">
                <head>
                <meta charset="UTF-8"/>
                <title>Credit Statement — %s</title>
                <style>
                  body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #333; }
                  h1 { font-size: 18px; margin: 0; }
                  h2 { font-size: 14px; margin: 4px 0; color: #555; }
                  .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 16px; }
                  .meta-row { display: flex; justify-content: space-between; margin-bottom: 12px; }
                  .meta-block p { margin: 2px 0; }
                  table { width: 100%%; border-collapse: collapse; margin-top: 10px; }
                  th { background: #f0f0f0; border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 11px; }
                  td { border: 1px solid #ddd; padding: 5px 8px; font-size: 11px; vertical-align: top; }
                  .amount { text-align: right; font-family: monospace; }
                  .balance { text-align: right; font-family: monospace; font-weight: bold; }
                  .type-PAYMENT { color: #1a7a1a; }
                  .type-INTEREST { color: #a05000; }
                  .type-SALE { color: #333; }
                  .summary { margin-top: 20px; text-align: right; }
                  .outstanding { font-size: 14px; font-weight: bold; }
                  .no-print { margin-top: 20px; }
                  @media print { .no-print { display: none; } }
                </style>
                </head>
                <body>
                """.formatted(client.getName()));

        sb.append("<div class='header'>")
                .append("<h1>").append(escapeHtml(pump.getName())).append("</h1>")
                .append("<h2>").append(escapeHtml(pump.getAddress())).append("</h2>")
                .append("<h2 style='margin-top:8px;color:#333;'>CREDIT ACCOUNT STATEMENT</h2>")
                .append("</div>");

        sb.append("<div class='meta-row'>")
                .append("<div class='meta-block'>")
                .append("<p><strong>Account:</strong> ").append(escapeHtml(client.getName())).append("</p>");
        if (client.getPhone() != null) {
            sb.append("<p><strong>Phone:</strong> ").append(escapeHtml(client.getPhone())).append("</p>");
        }
        if (client.getCreditLimit() != null && client.getCreditLimit().compareTo(BigDecimal.ZERO) > 0) {
            sb.append("<p><strong>Credit Limit:</strong> ₹").append(client.getCreditLimit().toPlainString()).append("</p>");
        }
        sb.append("</div>")
                .append("<div class='meta-block' style='text-align:right;'>")
                .append("<p>").append(periodLabel).append("</p>")
                .append("<p>Printed: ").append(LocalDate.now()).append("</p>")
                .append("</div></div>");

        if (transactions.isEmpty()) {
            sb.append("<p><em>No transactions found for the selected period.</em></p>");
        } else {
            sb.append("<table><thead><tr>")
                    .append("<th>Date</th><th>Type</th><th>Description</th>")
                    .append("<th class='amount'>Debit (₹)</th><th class='amount'>Credit (₹)</th>")
                    .append("<th class='balance'>Balance (₹)</th>")
                    .append("</tr></thead><tbody>");

            for (CreditTransactionResponse tx : transactions) {
                String typeClass = "type-" + tx.getType();
                String debit = "SALE".equals(tx.getType()) || "INTEREST".equals(tx.getType())
                        ? tx.getAmount().toPlainString() : "";
                String credit = "PAYMENT".equals(tx.getType()) ? tx.getAmount().toPlainString() : "";
                String desc = tx.getReference() != null ? escapeHtml(tx.getReference()) : "";
                if (tx.getDetail() != null) {
                    desc += " <span style='color:#888;'>(" + escapeHtml(tx.getDetail()) + ")</span>";
                }

                sb.append("<tr class='").append(typeClass).append("'>")
                        .append("<td>").append(tx.getOccurredAt().toLocalDate()).append("</td>")
                        .append("<td>").append(tx.getType()).append("</td>")
                        .append("<td>").append(desc).append("</td>")
                        .append("<td class='amount'>").append(debit).append("</td>")
                        .append("<td class='amount'>").append(credit).append("</td>")
                        .append("<td class='balance'>").append(tx.getRunningBalance().toPlainString()).append("</td>")
                        .append("</tr>");
            }
            sb.append("</tbody></table>");
        }

        sb.append("<div class='summary'>")
                .append("<p class='outstanding'>Outstanding Balance: ₹")
                .append(outstanding.setScale(2, RoundingMode.HALF_UP).toPlainString())
                .append("</p></div>");

        sb.append("<div class='no-print'><button onclick='window.print()' ")
                .append("style='padding:8px 20px;font-size:13px;cursor:pointer;'>Print Statement</button></div>");

        sb.append("</body></html>");
        return sb.toString();
    }

    private String escapeHtml(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
