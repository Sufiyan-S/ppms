package com.ppms.credit;

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
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The database allows one live charge per period, lets a waived period be charged again and keeps waivers complete. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(PostgresTestContainerConfig.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class CreditInterestChargeSchemaTest {

    private static final LocalDate PERIOD_FROM = TestDates.today().minusDays(30);
    private static final LocalDate PERIOD_TO = TestDates.today().minusDays(1);

    @Autowired private UserRepository userRepository;
    @Autowired private PumpLocationRepository pumpLocationRepository;
    @Autowired private CreditClientRepository clientRepository;
    @Autowired private CreditInterestChargeRepository interestChargeRepository;

    private User owner;
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
                .dateOfJoining(TestDates.today())
                .build());
        PumpLocation pump = pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(owner.getId())
                .name("Pump " + unique)
                .address("Address")
                .maxDuCount(4)
                .build());
        client = clientRepository.save(CreditClient.builder().pumpId(pump.getId()).name("Client " + unique).build());
    }

    @Test
    void periodCanHoldOneLiveChargeAndBeChargedAgainOnlyAfterItIsWaived() {
        CreditInterestCharge first = interestChargeRepository.saveAndFlush(charge());

        assertThatThrownBy(() -> interestChargeRepository.saveAndFlush(charge()))
                .isInstanceOf(DataIntegrityViolationException.class);

        first.setVoidedAt(OffsetDateTime.now());
        first.setVoidedBy(owner.getId());
        first.setVoidReason("Wrong rate");
        interestChargeRepository.saveAndFlush(first);
        assertThat(interestChargeRepository.saveAndFlush(charge()).getId()).isNotNull();
        assertThat(interestChargeRepository.sumAmountByClientId(client.getId())).isEqualByComparingTo("40.00");
        assertThat(interestChargeRepository.findLastPeriodToByClientIds(List.of(client.getId()))).contains(PERIOD_TO);
    }

    @Test
    void waiverWithoutAReasonIsRefused() {
        CreditInterestCharge charge = interestChargeRepository.saveAndFlush(charge());
        charge.setVoidedAt(OffsetDateTime.now());
        charge.setVoidedBy(owner.getId());

        assertThatThrownBy(() -> interestChargeRepository.saveAndFlush(charge))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private CreditInterestCharge charge() {
        return CreditInterestCharge.builder()
                .pumpId(client.getPumpId())
                .clientId(client.getId())
                .amount(new BigDecimal("40.00"))
                .outstandingBalance(new BigDecimal("1000.00"))
                .rateApplied(new BigDecimal("2.00"))
                .daysApplied(30)
                .periodFrom(PERIOD_FROM)
                .periodTo(PERIOD_TO)
                .source("TEST")
                .build();
    }
}
