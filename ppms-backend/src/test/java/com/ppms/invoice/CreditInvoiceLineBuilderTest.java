package com.ppms.invoice;

import com.ppms.ancillary.AncillaryProduct;
import com.ppms.ancillary.AncillaryProductStatus;
import com.ppms.ancillary.AncillarySale;
import com.ppms.ancillary.UnitOfMeasure;
import com.ppms.shift.ShiftCreditEntry;
import com.ppms.transaction.TransactionPaymentMode;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class CreditInvoiceLineBuilderTest {

    private static final long PRODUCT_ID = 5L;

    private final AncillaryProduct engineOil = AncillaryProduct.builder()
            .id(PRODUCT_ID)
            .name("Engine Oil")
            .brand("Castrol")
            .packageSize(new BigDecimal("1.000"))
            .unitOfMeasure(UnitOfMeasure.LITRE)
            .gstRatePercent(new BigDecimal("18.00"))
            .hsnCode("27101980")
            .status(AncillaryProductStatus.ACTIVE)
            .build();

    @Test
    void fuelLineCarriesNoGstAndIsDatedByItsSaleDateNotWhenItWasEntered() {
        ShiftCreditEntry entry = ShiftCreditEntry.builder()
                .id(11L)
                .amount(new BigDecimal("1500"))
                .fuelType("DIESEL")
                .description("given to driver")
                .vehicleRegistration("MH12AB1234")
                .billNo("B-7")
                .saleDate(LocalDate.of(2026, 3, 28))
                .createdAt(OffsetDateTime.parse("2026-04-02T10:00:00Z"))
                .build();

        CreditInvoiceLine line = CreditInvoiceLineBuilder.fuelLines(List.of(entry)).get(0);

        assertThat(line.getLineType()).isEqualTo(InvoiceLineType.FUEL);
        assertThat(line.getSaleDate()).isEqualTo(LocalDate.of(2026, 3, 28));
        assertThat(line.getDescription()).isEqualTo("DIESEL – given to driver");
        assertThat(line.getLineTotal()).isEqualByComparingTo("1500.00");
        assertThat(line.getCgst().add(line.getSgst()).add(line.getIgst())).isEqualByComparingTo("0");
        assertThat(line.getTaxableValue()).isNull();
    }

    @Test
    void taxInclusiveSaleWithNoStoredGstHasItsGstTakenOutOfThePricePaid() {
        CreditInvoiceLine line = ancillaryLine(sale("236.00", "0.00", "236.00", 2), true);

        assertThat(line.getTaxableValue()).isEqualByComparingTo("200.00");
        assertThat(line.getRate()).isEqualByComparingTo("100.00");
        assertThat(line.getCgst()).isEqualByComparingTo("18.00");
        assertThat(line.getSgst()).isEqualByComparingTo("18.00");
        assertThat(line.getIgst()).isEqualByComparingTo("0.00");
        assertThat(line.getLineTotal()).isEqualByComparingTo("236.00");
        assertThat(line.getHsnCode()).isEqualTo("27101980");
        assertThat(line.getGstRate()).isEqualByComparingTo("18.00");
    }

    @Test
    void storedGstIsUsedAsCharged() {
        CreditInvoiceLine line = ancillaryLine(sale("100.00", "18.05", "118.05", 1), true);

        assertThat(line.getTaxableValue()).isEqualByComparingTo("100.00");
        assertThat(line.getCgst()).isEqualByComparingTo("9.03");
        assertThat(line.getSgst()).isEqualByComparingTo("9.02");
        assertThat(line.getLineTotal()).isEqualByComparingTo("118.05");
    }

    @Test
    void lineTotalStillEqualsThePricePaidWhenTheGstSplitHasAnOddPaisa() {
        CreditInvoiceLine line = ancillaryLine(sale("100.00", "0.00", "100.00", 1), true);

        assertThat(line.getTaxableValue()).isEqualByComparingTo("84.75");
        assertThat(line.getCgst()).isEqualByComparingTo("7.63");
        assertThat(line.getSgst()).isEqualByComparingTo("7.62");
        assertThat(line.getTaxableValue().add(line.getCgst()).add(line.getSgst())).isEqualByComparingTo("100.00");
    }

    @Test
    void gstIsTakenOutAtTheRateStoredOnTheSaleNotTheProductsCurrentRate() {
        AncillarySale soldAtTwelvePercent = sale("224.00", "0.00", "224.00", 2);
        soldAtTwelvePercent.setGstRatePercent(new BigDecimal("12.00"));

        CreditInvoiceLine line = ancillaryLine(soldAtTwelvePercent, true);

        assertThat(line.getGstRate()).isEqualByComparingTo("12.00");
        assertThat(line.getTaxableValue()).isEqualByComparingTo("200.00");
        assertThat(line.getCgst()).isEqualByComparingTo("12.00");
        assertThat(line.getSgst()).isEqualByComparingTo("12.00");
        assertThat(line.getLineTotal()).isEqualByComparingTo("224.00");
    }

    @Test
    void saleToAnotherStateIsChargedIgst() {
        CreditInvoiceLine line = ancillaryLine(sale("236.00", "0.00", "236.00", 2), false);

        assertThat(line.getIgst()).isEqualByComparingTo("36.00");
        assertThat(line.getCgst()).isEqualByComparingTo("0.00");
        assertThat(line.getSgst()).isEqualByComparingTo("0.00");
    }

    private CreditInvoiceLine ancillaryLine(AncillarySale sale, boolean sameState) {
        return CreditInvoiceLineBuilder.ancillaryLines(List.of(sale), Map.of(PRODUCT_ID, engineOil), sameState).get(0);
    }

    private static AncillarySale sale(String totalAmount, String gstAmount, String totalWithGst, int quantity) {
        return AncillarySale.builder()
                .id(21L)
                .productId(PRODUCT_ID)
                .quantityUnits(quantity)
                .sellingPricePerUnit(new BigDecimal(totalWithGst).divide(new BigDecimal(quantity)))
                .totalAmount(new BigDecimal(totalAmount))
                .gstAmount(new BigDecimal(gstAmount))
                .totalWithGst(new BigDecimal(totalWithGst))
                .gstRatePercent(new BigDecimal("18.00"))
                .paymentMode(TransactionPaymentMode.CREDIT)
                .saleDate(LocalDate.of(2026, 11, 2))
                .build();
    }
}
