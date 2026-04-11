package com.ppms.cash;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CashEventRepository extends JpaRepository<CashEvent, Long> {

    List<CashEvent> findByPumpIdOrderByEventDateDescCreatedAtDesc(Long pumpId);

    Page<CashEvent> findByPumpIdOrderByEventDateDescCreatedAtDesc(Long pumpId, Pageable pageable);

    /** Filter by event type — used when the event-type filter is active. */
    Page<CashEvent> findByPumpIdAndEventTypeOrderByEventDateDescCreatedAtDesc(
            Long pumpId, CashEventType eventType, Pageable pageable);
}
