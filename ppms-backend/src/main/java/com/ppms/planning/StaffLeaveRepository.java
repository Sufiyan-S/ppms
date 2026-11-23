package com.ppms.planning;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface StaffLeaveRepository extends JpaRepository<StaffLeave, Long> {

    List<StaffLeave> findByUserIdOrderByLeaveDateDesc(Long userId);

    /** All leave records for a pump within a date range — used during plan generation. */
    List<StaffLeave> findByPumpIdAndLeaveDateBetween(Long pumpId, LocalDate from, LocalDate to);

    boolean existsByUserIdAndLeaveDate(Long userId, LocalDate leaveDate);

    /** Count leave days for a user within a date range — used for payroll deduction. */
    long countByUserIdAndLeaveDateBetween(Long userId, LocalDate from, LocalDate to);

    @Modifying
    @Query("DELETE FROM StaffLeave l WHERE l.userId = :userId AND l.pumpId = :pumpId AND l.leaveDate >= :from")
    int deleteForUserAtPumpFrom(@Param("userId") Long userId, @Param("pumpId") Long pumpId, @Param("from") LocalDate from);
}
