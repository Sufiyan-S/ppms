package com.ppms.pump;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface PumpClosureRepository extends JpaRepository<PumpClosure, Long> {

    /** Returns all closures for a pump, newest first. */
    List<PumpClosure> findByPumpIdOrderByClosureDateDesc(Long pumpId);

    /** Used by ShiftService.openShift() to block shift creation on closure days. */
    Optional<PumpClosure> findByPumpIdAndClosureDate(Long pumpId, LocalDate closureDate);
}
