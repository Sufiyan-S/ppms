package com.ppms.shift;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ShiftNozzleRepository extends JpaRepository<ShiftNozzle, ShiftNozzleId> {

    /** Returns all nozzle IDs assigned to a shift. */
    @Query("SELECT sn.nozzleId FROM ShiftNozzle sn WHERE sn.shiftId = :shiftId")
    List<Long> findNozzleIdsByShiftId(Long shiftId);
}
