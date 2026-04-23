package com.ppms.settlement;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentSettlementConfigRepository extends JpaRepository<PaymentSettlementConfig, Long> {

    /** All configs for a pump — used by the config API endpoint and the balance sheet display. */
    List<PaymentSettlementConfig> findByPumpIdOrderByPaymentType(Long pumpId);

    /** Lookup by pump + type — used by the upsert config endpoint. */
    Optional<PaymentSettlementConfig> findByPumpIdAndPaymentType(Long pumpId, SettlementPaymentType paymentType);

    /** All enabled configs across all pumps — used by SettlementReminderJob to generate alerts. */
    List<PaymentSettlementConfig> findByEnabledTrue();
}
