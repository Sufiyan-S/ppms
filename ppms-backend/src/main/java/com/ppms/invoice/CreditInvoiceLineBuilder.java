package com.ppms.invoice;

import com.ppms.ancillary.AncillaryProduct;
import com.ppms.ancillary.AncillaryProductQueryService;
import com.ppms.ancillary.AncillarySale;
import com.ppms.shift.ShiftCreditEntry;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

/** Turns credit sales into invoice lines: fuel outside GST, ancillary products with their GST split. */
final class CreditInvoiceLineBuilder {

    private static final BigDecimal ZERO = BigDecimal.ZERO.setScale(2);
    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final int MAX_DESCRIPTION_LENGTH = 300;

    private CreditInvoiceLineBuilder() {
    }

    static List<CreditInvoiceLine> fuelLines(List<ShiftCreditEntry> entries) {
        return entries.stream()
                .map(entry -> CreditInvoiceLine.builder()
                        .lineType(InvoiceLineType.FUEL)
                        .sourceId(entry.getId())
                        .saleDate(entry.getSaleDate())
                        .billNo(entry.getBillNo())
                        .description(fuelDescription(entry))
                        .vehicleRegistration(entry.getVehicleRegistration())
                        .cgst(ZERO)
                        .sgst(ZERO)
                        .igst(ZERO)
                        .lineTotal(entry.getAmount().setScale(2, RoundingMode.HALF_UP))
                        .build())
                .toList();
    }

    /**
     * Counter sales are rung up at a tax-inclusive price and usually store no GST amount; then the GST
     * is taken out of the price paid at the rate stored on the sale, so the invoice total still equals what was charged.
     */
    static List<CreditInvoiceLine> ancillaryLines(List<AncillarySale> sales, Map<Long, AncillaryProduct> productsById,
                                                  boolean sameState) {
        return sales.stream()
                .map(sale -> ancillaryLine(sale, productsById.get(sale.getProductId()), sameState))
                .toList();
    }

    private static CreditInvoiceLine ancillaryLine(AncillarySale sale, AncillaryProduct product, boolean sameState) {
        BigDecimal gstRate = sale.getGstRatePercent().setScale(2, RoundingMode.HALF_UP);
        BigDecimal taxableValue;
        BigDecimal gstAmount;
        if (sale.getGstAmount().signum() > 0) {
            taxableValue = sale.getTotalAmount().setScale(2, RoundingMode.HALF_UP);
            gstAmount = sale.getGstAmount().setScale(2, RoundingMode.HALF_UP);
        } else {
            BigDecimal pricePaid = sale.getTotalWithGst().setScale(2, RoundingMode.HALF_UP);
            taxableValue = pricePaid.multiply(HUNDRED).divide(HUNDRED.add(gstRate), 2, RoundingMode.HALF_UP);
            gstAmount = pricePaid.subtract(taxableValue);
        }
        GstTaxSplit split = GstTaxSplit.of(gstAmount, sameState);
        return CreditInvoiceLine.builder()
                .lineType(InvoiceLineType.ANCILLARY)
                .sourceId(sale.getId())
                .saleDate(sale.getSaleDate())
                .billNo(sale.getBillNo())
                .description(limitLength(AncillaryProductQueryService.buildDisplayName(product)))
                .hsnCode(product.getHsnCode())
                .quantity(sale.getQuantityUnits())
                .rate(taxableValue.divide(new BigDecimal(sale.getQuantityUnits()), 2, RoundingMode.HALF_UP))
                .taxableValue(taxableValue)
                .gstRate(gstRate)
                .cgst(split.cgst())
                .sgst(split.sgst())
                .igst(split.igst())
                .lineTotal(taxableValue.add(gstAmount))
                .build();
    }

    private static String fuelDescription(ShiftCreditEntry entry) {
        String fuel = entry.getFuelType() != null ? entry.getFuelType() : "Fuel";
        if (entry.getDescription() == null || entry.getDescription().isBlank()) {
            return fuel;
        }
        return limitLength(fuel + " – " + entry.getDescription().trim());
    }

    private static String limitLength(String text) {
        return text.length() <= MAX_DESCRIPTION_LENGTH ? text : text.substring(0, MAX_DESCRIPTION_LENGTH);
    }
}
