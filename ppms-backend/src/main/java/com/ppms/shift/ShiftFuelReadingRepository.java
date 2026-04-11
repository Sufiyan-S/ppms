package com.ppms.shift;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ShiftFuelReadingRepository extends JpaRepository<ShiftFuelReading, Long> {

    List<ShiftFuelReading> findByShiftId(Long shiftId);

    void deleteByShiftId(Long shiftId);

    /** Batch fetch for balance sheet generation — avoids N+1 across multiple shifts */
    List<ShiftFuelReading> findByShiftIdIn(java.util.Collection<Long> shiftIds);
}
