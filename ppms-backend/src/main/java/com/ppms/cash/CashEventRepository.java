package com.ppms.cash;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface CashEventRepository extends JpaRepository<CashEvent, Long> {

    Page<CashEvent> findByPumpIdOrderByEventDateDescCreatedAtDesc(Long pumpId, Pageable pageable);

    /** Filter by event type — used when the event-type filter is active. */
    Page<CashEvent> findByPumpIdAndEventTypeOrderByEventDateDescCreatedAtDesc(
            Long pumpId, CashEventType eventType, Pageable pageable);

    /**
     * Computes the current cash drawer balance in a single DB aggregate query.
     * CASH_OUT subtracts, OPENING_BALANCE and CASH_IN add.
     * Returns 0 if no relevant events exist.
     */
    @Query("""
            SELECT COALESCE(SUM(
                CASE WHEN e.eventType = 'CASH_OUT' THEN -e.amount ELSE e.amount END
            ), 0)
            FROM CashEvent e
            WHERE e.pumpId = :pumpId
              AND e.eventType IN ('OPENING_BALANCE', 'CASH_IN', 'CASH_OUT')
            """)
    BigDecimal computeBalance(@Param("pumpId") Long pumpId);
}
