package com.ppms.planning;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ShiftPlanRepository extends JpaRepository<ShiftPlan, Long> {

    Optional<ShiftPlan> findByPumpIdAndWeekStart(Long pumpId, LocalDate weekStart);

    List<ShiftPlan> findByPumpIdOrderByWeekStartDesc(Long pumpId);
}
