package com.ppms.payroll;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface PayrollRepository extends JpaRepository<PayrollRecord, Long> {

    List<PayrollRecord> findByPumpIdOrderByPeriodFromDescCreatedAtDesc(Long pumpId);

    List<PayrollRecord> findByPumpIdAndUserIdOrderByPeriodFromDesc(Long pumpId, Long userId);

    Optional<PayrollRecord> findFirstByPumpIdAndUserIdAndPeriodFromLessThanEqualAndPeriodToGreaterThanEqual(
            Long pumpId, Long userId, LocalDate periodTo, LocalDate periodFrom);
}
