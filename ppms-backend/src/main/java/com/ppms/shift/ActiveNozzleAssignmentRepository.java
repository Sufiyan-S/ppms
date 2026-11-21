package com.ppms.shift;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ActiveNozzleAssignmentRepository extends JpaRepository<ActiveNozzleAssignment, Long> {

    /** Returns 1 when the nozzle was free and is now assigned, 0 when another shift already holds it. */
    @Modifying
    @Query(value = """
            INSERT INTO active_nozzle_assignments (nozzle_id, shift_id)
            VALUES (:nozzleId, :shiftId)
            ON CONFLICT (nozzle_id) DO NOTHING
            """, nativeQuery = true)
    int assignIfFree(@Param("nozzleId") Long nozzleId, @Param("shiftId") Long shiftId);

    @Modifying
    @Query("DELETE FROM ActiveNozzleAssignment a WHERE a.shiftId = :shiftId")
    void deleteByShiftId(@Param("shiftId") Long shiftId);
}
