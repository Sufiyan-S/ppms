package com.ppms.credit;

import com.ppms.common.exception.BusinessException;
import com.ppms.support.FixedBusinessClock;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CreditAccountPolicyServiceTest {

    private static final long PUMP_ID = 7L;

    private final CreditClientRepository clientRepository = mock(CreditClientRepository.class);

    private final CreditAccountPolicyService policyService = new CreditAccountPolicyService(clientRepository,
            mock(CreditInterestService.class), mock(CreditExtensionRepository.class), mock(CreditPaymentRepository.class),
            new FixedBusinessClock(OffsetDateTime.parse("2026-03-06T10:00:00+05:30")),
            mock(EntityManager.class));

    @Test
    void clientIsFoundByIdOnlyWhenItBelongsToThePump() {
        CreditClient client = client(1L, PUMP_ID, null, true);
        CreditClient otherPumpClient = client(2L, PUMP_ID + 1, null, true);
        when(clientRepository.findById(1L)).thenReturn(Optional.of(client));
        when(clientRepository.findById(2L)).thenReturn(Optional.of(otherPumpClient));

        assertThat(policyService.requireClientForCreditEntry(PUMP_ID, 1L, "ignored")).isSameAs(client);
        assertThatThrownBy(() -> policyService.requireClientForCreditEntry(PUMP_ID, 2L, "ignored"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void clientIsFoundByExactNameAndAnUnknownNameIsRefused() {
        CreditClient client = client(1L, PUMP_ID, null, true);
        when(clientRepository.findByPumpIdAndName(PUMP_ID, "Fleet Co")).thenReturn(Optional.of(client));
        when(clientRepository.findByPumpIdAndName(PUMP_ID, "Walk-in")).thenReturn(Optional.empty());

        assertThat(policyService.requireClientForCreditEntry(PUMP_ID, null, "  Fleet Co ")).isSameAs(client);
        assertThatThrownBy(() -> policyService.requireClientForCreditEntry(PUMP_ID, null, "Walk-in"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("No credit client named 'Walk-in'");
        assertThatThrownBy(() -> policyService.requireClientForCreditEntry(PUMP_ID, null, " "))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void disabledClientOrSubAccountOfADisabledParentCannotTakeCredit() {
        CreditClient disabledParent = client(1L, PUMP_ID, null, false);
        CreditClient subAccount = client(2L, PUMP_ID, 1L, true);
        CreditClient activeStandalone = client(3L, PUMP_ID, null, true);
        when(clientRepository.findById(1L)).thenReturn(Optional.of(disabledParent));

        assertThatThrownBy(() -> policyService.requireClientAcceptsCredit(disabledParent))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Credit is disabled");
        assertThatThrownBy(() -> policyService.requireClientAcceptsCredit(subAccount))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("parent account");
        assertThatNoException().isThrownBy(() -> policyService.requireClientAcceptsCredit(activeStandalone));
    }

    private static CreditClient client(Long id, Long pumpId, Long parentClientId, boolean active) {
        return CreditClient.builder()
                .id(id)
                .pumpId(pumpId)
                .name("Client " + id)
                .parentClientId(parentClientId)
                .isActive(active)
                .build();
    }
}
