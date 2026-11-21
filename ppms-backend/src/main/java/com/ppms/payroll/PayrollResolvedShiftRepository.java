package com.ppms.payroll;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PayrollResolvedShiftRepository extends JpaRepository<PayrollResolvedShift, Long> {

    List<PayrollResolvedShift> findByPayrollId(Long payrollId);
}
