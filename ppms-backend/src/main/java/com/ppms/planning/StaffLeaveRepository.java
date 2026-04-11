package com.ppms.planning;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

public interface StaffLeaveRepository extends JpaRepository<StaffLeave, Long> {

    List<StaffLeave> findByUserIdOrderByLeaveDateDesc(Long userId);

    /** All leave records for a pump within a date range — used during plan generation. */
    List<StaffLeave> findByPumpIdAndLeaveDateBetween(Long pumpId, LocalDate from, LocalDate to);

    boolean existsByUserIdAndLeaveDate(Long userId, LocalDate leaveDate);

    /** Count leave days for a user within a date range — used for payroll deduction. */
    long countByUserIdAndLeaveDateBetween(Long userId, LocalDate from, LocalDate to);
}
