package com.ppms.transaction;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface FuelTransactionRepository extends JpaRepository<FuelTransaction, Long> {

    /** All transactions for a shift — bounded by shift duration, no pagination needed. */
    List<FuelTransaction> findByShiftIdOrderByRecordedAtAsc(Long shiftId);

    /** Paginated by pump — use for the API to prevent loading all-time transaction history. */
    Page<FuelTransaction> findByPumpIdOrderByRecordedAtDesc(Long pumpId, Pageable pageable);

    /** Paginated pump history limited to the shifts one operator ran, newest first. */
    @Query("""
            SELECT t FROM FuelTransaction t
            WHERE t.pumpId = :pumpId
              AND t.shiftId IN (SELECT s.id FROM Shift s WHERE s.operatorId = :operatorId)
            ORDER BY t.recordedAt DESC
            """)
    Page<FuelTransaction> findForOperatorShifts(@Param("pumpId") Long pumpId,
                                                @Param("operatorId") Long operatorId,
                                                Pageable pageable);
}
