package com.ppms.shift;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ShiftFuelReadingRepository extends JpaRepository<ShiftFuelReading, Long> {

    List<ShiftFuelReading> findByShiftId(Long shiftId);

    void deleteByShiftId(Long shiftId);

    /** Batch fetch for balance sheet generation — avoids N+1 across multiple shifts */
    List<ShiftFuelReading> findByShiftIdIn(java.util.Collection<Long> shiftIds);

    /** Opening readings of shifts not yet closed whose nozzles draw from the tank; their sales have not left its stock. */
    @Query("""
            SELECT r FROM ShiftFuelReading r, Shift s
            WHERE r.shiftId = s.id AND r.tankId = :tankId
              AND s.status IN ('OPEN', 'OPEN_OVERDUE', 'AUTO_CLOSED_OVERDUE')
            ORDER BY r.nozzleId
            """)
    List<ShiftFuelReading> findOpenShiftReadingsByTankId(@Param("tankId") Long tankId);
}
