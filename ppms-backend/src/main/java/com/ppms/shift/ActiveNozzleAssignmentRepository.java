package com.ppms.shift;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ActiveNozzleAssignmentRepository extends JpaRepository<ActiveNozzleAssignment, Long> {

    @Modifying
    @Query("DELETE FROM ActiveNozzleAssignment a WHERE a.shiftId = :shiftId")
    void deleteByShiftId(@Param("shiftId") Long shiftId);
}
