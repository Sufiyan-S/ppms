package com.ppms.payroll;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PayrollRepository extends JpaRepository<PayrollRecord, Long> {

    List<PayrollRecord> findByPumpIdOrderByPeriodFromDescCreatedAtDesc(Long pumpId);

    List<PayrollRecord> findByPumpIdAndUserIdOrderByPeriodFromDesc(Long pumpId, Long userId);
}
