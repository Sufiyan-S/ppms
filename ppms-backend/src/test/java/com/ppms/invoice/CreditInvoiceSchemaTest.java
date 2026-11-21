package com.ppms.invoice;

import com.ppms.credit.CreditClient;
import com.ppms.credit.CreditClientRepository;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.support.PostgresTestContainerConfig;
import com.ppms.support.TestDates;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The database itself refuses a sale on two issued invoices, a reused number and malformed GST fields. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(PostgresTestContainerConfig.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class CreditInvoiceSchemaTest {

    private static final LocalDate TODAY = TestDates.today();

    @Autowired private UserRepository userRepository;
    @Autowired private PumpLocationRepository pumpLocationRepository;
    @Autowired private CreditClientRepository clientRepository;
    @Autowired private CreditInvoiceRepository invoiceRepository;
    @Autowired private CreditInvoiceLineRepository lineRepository;

    private User owner;
    private PumpLocation pump;
    private CreditClient client;

    @BeforeEach
    void createPumpAndClient() {
        String unique = UUID.randomUUID().toString().substring(0, 8);
        owner = userRepository.save(User.builder()
                .employeeId("EMP-" + unique)
                .fullName("Owner " + unique)
                .phoneNumber("8" + String.format("%09d", Math.abs(System.nanoTime()) % 1_000_000_000L))
                .passwordHash("hash")
                .role(UserRole.OWNER)
                .status(UserStatus.ACTIVE)
                .dateOfJoining(TODAY)
                .build());
        pump = pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(owner.getId())
                .name("Pump " + unique)
                .address("Address")
                .maxDuCount(4)
                .build());
        client = clientRepository.save(CreditClient.builder().pumpId(pump.getId()).name("Client " + unique).build());
    }

    @Test
    void saleCannotBeOnTwoIssuedInvoicesButCanBeBilledAgainOnceReleased() {
        CreditInvoiceLine first = lineRepository.save(fuelLine(invoice(1).getId(), 9001L));
        CreditInvoice second = invoice(2);

        assertThatThrownBy(() -> lineRepository.saveAndFlush(fuelLine(second.getId(), 9001L)))
                .isInstanceOf(DataIntegrityViolationException.class);

        first.setActive(false);
        lineRepository.save(first);
        assertThat(lineRepository.save(fuelLine(second.getId(), 9001L)).getId()).isNotNull();
    }

    @Test
    void invoiceNumberCannotBeReusedWithinAPump() {
        invoice(1);

        assertThatThrownBy(() -> invoiceRepository.saveAndFlush(invoiceBuilder(1).sequenceNumber(99).build()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void cancelledInvoiceMustRecordWhoWhenAndWhy() {
        assertThatThrownBy(() -> invoiceRepository.saveAndFlush(invoiceBuilder(1)
                .status(CreditInvoiceStatus.CANCELLED)
                .build()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void malformedGstinAndInvoicePrefixAreRefused() {
        pump.setGstin("27abcde1234f1z5");
        assertThatThrownBy(() -> pumpLocationRepository.saveAndFlush(pump)).isInstanceOf(DataIntegrityViolationException.class);

        PumpLocation reloaded = pumpLocationRepository.findById(pump.getId()).orElseThrow();
        reloaded.setInvoicePrefix("TOOLONG");
        assertThatThrownBy(() -> pumpLocationRepository.saveAndFlush(reloaded)).isInstanceOf(DataIntegrityViolationException.class);
    }

    private CreditInvoice invoice(int sequenceNumber) {
        return invoiceRepository.save(invoiceBuilder(sequenceNumber).build());
    }

    private CreditInvoice.CreditInvoiceBuilder invoiceBuilder(int sequenceNumber) {
        BigDecimal amount = new BigDecimal("100.00");
        BigDecimal zero = BigDecimal.ZERO.setScale(2);
        return CreditInvoice.builder()
                .pumpId(pump.getId())
                .clientId(client.getId())
                .invoiceNumber("T/26-27/" + String.format("%04d", sequenceNumber))
                .financialYear("2026-27")
                .sequenceNumber(sequenceNumber)
                .periodFrom(TODAY)
                .periodTo(TODAY)
                .issuedOn(TODAY)
                .sellerTradeName("Pump")
                .sellerLegalName("Pump Pvt Ltd")
                .sellerGstin("27AAAPL1234C1ZV")
                .sellerStateCode("27")
                .buyerName("Client")
                .buyerStateCode("27")
                .placeOfSupplyStateCode("27")
                .fuelTotal(amount)
                .taxableTotal(zero)
                .cgstTotal(zero)
                .sgstTotal(zero)
                .igstTotal(zero)
                .grandTotal(amount)
                .createdBy(owner.getId());
    }

    private static CreditInvoiceLine fuelLine(Long invoiceId, Long creditEntryId) {
        BigDecimal zero = BigDecimal.ZERO.setScale(2);
        return CreditInvoiceLine.builder()
                .invoiceId(invoiceId)
                .lineType(InvoiceLineType.FUEL)
                .sourceId(creditEntryId)
                .saleDate(TODAY)
                .description("PETROL")
                .cgst(zero)
                .sgst(zero)
                .igst(zero)
                .lineTotal(new BigDecimal("100.00"))
                .build();
    }
}
