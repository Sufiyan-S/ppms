package com.ppms.credit;

import com.ppms.ancillary.AncillaryProduct;
import com.ppms.ancillary.AncillaryProductRepository;
import com.ppms.ancillary.AncillarySale;
import com.ppms.ancillary.AncillarySaleRepository;
import com.ppms.ancillary.UnitOfMeasure;
import com.ppms.common.text.ServerTextCodes;
import com.ppms.shift.ShiftCreditEntryRepository;
import com.ppms.support.FixedBusinessClock;
import com.ppms.transaction.TransactionPaymentMode;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CreditLedgerQueryServiceTest {

    private static final long CLIENT_ID = 5L;
    private static final long PRODUCT_ID = 11L;
    private static final long RECORDER_ID = 21L;
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-03-06T10:00:00+05:30");

    private final CreditPaymentRepository paymentRepository = mock(CreditPaymentRepository.class);
    private final AncillarySaleRepository ancillarySaleRepository = mock(AncillarySaleRepository.class);
    private final AncillaryProductRepository ancillaryProductRepository = mock(AncillaryProductRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);

    private final CreditLedgerQueryService queryService = new CreditLedgerQueryService(
            mock(CreditClientRepository.class), paymentRepository, mock(CreditInterestChargeRepository.class),
            mock(ShiftCreditEntryRepository.class), ancillarySaleRepository, ancillaryProductRepository,
            mock(CreditInterestService.class), userRepository, new FixedBusinessClock(NOW));

    @Test
    void counterSaleRowCarriesCodeAndParamsWithBillNumber() {
        givenCounterSale("B-42");

        CreditTransactionResponse row = onlyRow();

        assertThat(row.getReference()).isEqualTo("Castrol Engine Oil — 1 LITRE × 2 (Bill B-42)");
        assertThat(row.getReferenceCode()).isEqualTo(ServerTextCodes.COUNTER_SALE_DETAILS_WITH_BILL);
        assertThat(row.getReferenceParams())
                .isEqualTo(Map.of("productName", "Castrol Engine Oil — 1 LITRE", "quantity", 2, "billNo", "B-42"));
    }

    @Test
    void counterSaleRowWithoutBillNumberCarriesTheShorterCode() {
        givenCounterSale(" ");

        CreditTransactionResponse row = onlyRow();

        assertThat(row.getReference()).isEqualTo("Castrol Engine Oil — 1 LITRE × 2");
        assertThat(row.getReferenceCode()).isEqualTo(ServerTextCodes.COUNTER_SALE_DETAILS);
        assertThat(row.getReferenceParams()).containsOnlyKeys("productName", "quantity");
    }

    @Test
    void paymentWithoutNotesByAMissingUserIsLabelledUnknownStaffWithACode() {
        givenPayment(null);

        CreditTransactionResponse row = onlyRow();

        assertThat(row.getReference()).isEqualTo("Unknown staff");
        assertThat(row.getReferenceCode()).isEqualTo(ServerTextCodes.UNKNOWN_STAFF);
        assertThat(row.getReferenceParams()).isEmpty();
    }

    @Test
    void paymentWithoutNotesShowsTheRecorderNameWithoutACode() {
        givenPayment(null);
        User recorder = new User();
        recorder.setId(RECORDER_ID);
        recorder.setFullName("Ravi Manager");
        when(userRepository.findAllById(any())).thenReturn(List.of(recorder));

        CreditTransactionResponse row = onlyRow();

        assertThat(row.getReference()).isEqualTo("Ravi Manager");
        assertThat(row.getReferenceCode()).isNull();
    }

    @Test
    void paymentNotesAreShownAsTheyAreWithoutACode() {
        givenPayment("Cheque 1234");

        CreditTransactionResponse row = onlyRow();

        assertThat(row.getReference()).isEqualTo("Cheque 1234");
        assertThat(row.getReferenceCode()).isNull();
    }

    private CreditTransactionResponse onlyRow() {
        List<CreditTransactionResponse> rows = queryService.getTransactions(CLIENT_ID, 0, 10).content();
        assertThat(rows).hasSize(1);
        return rows.get(0);
    }

    private void givenCounterSale(String billNo) {
        AncillarySale sale = AncillarySale.builder()
                .id(1L).productId(PRODUCT_ID).quantityUnits(2).billNo(billNo)
                .totalWithGst(new BigDecimal("800.00")).paymentMode(TransactionPaymentMode.CREDIT).clientId(CLIENT_ID)
                .saleDate(LocalDate.of(2026, 3, 6)).createdAt(NOW)
                .build();
        AncillaryProduct product = AncillaryProduct.builder()
                .id(PRODUCT_ID).brand("Castrol").name("Engine Oil")
                .packageSize(BigDecimal.ONE).unitOfMeasure(UnitOfMeasure.LITRE)
                .build();
        when(ancillarySaleRepository.findByClientIdsAndPaymentMode(List.of(CLIENT_ID), TransactionPaymentMode.CREDIT))
                .thenReturn(List.of(sale));
        when(ancillaryProductRepository.findAllById(any())).thenReturn(List.of(product));
    }

    private void givenPayment(String notes) {
        CreditPayment payment = CreditPayment.builder()
                .id(2L).clientId(CLIENT_ID).amount(new BigDecimal("100.00")).paymentMode(PaymentMode.CASH)
                .notes(notes).recordedById(RECORDER_ID).paidAt(LocalDate.of(2026, 3, 6)).createdAt(NOW)
                .build();
        when(paymentRepository.findByClientIdOrderByPaidAtDesc(CLIENT_ID)).thenReturn(List.of(payment));
    }
}
