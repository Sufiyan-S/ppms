package com.ppms.transaction;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FuelTransactionRepository extends JpaRepository<FuelTransaction, Long> {

    /** All transactions for a shift — bounded by shift duration, no pagination needed. */
    List<FuelTransaction> findByShiftIdOrderByRecordedAtAsc(Long shiftId);

    /** Paginated by pump — use for the API to prevent loading all-time transaction history. */
    Page<FuelTransaction> findByPumpIdOrderByRecordedAtDesc(Long pumpId, Pageable pageable);
}
