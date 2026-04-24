package com.ppms.shift;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ShiftHandoverRepository extends JpaRepository<ShiftHandover, Long> {

    /** Returns paginated handovers for a pump, newest first. */
    Page<ShiftHandover> findByPumpIdOrderByHandoverTimeDesc(Long pumpId, Pageable pageable);

    /** Used to check if a handover already exists for a given outgoing shift. */
    java.util.Optional<ShiftHandover> findByOutgoingShiftId(Long outgoingShiftId);
}
