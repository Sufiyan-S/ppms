package com.ppms.shift;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ShiftHandoverRepository extends JpaRepository<ShiftHandover, Long> {

    /** Returns all handovers for a pump, newest first. */
    List<ShiftHandover> findByPumpIdOrderByHandoverTimeDesc(Long pumpId);

    /** Used to check if a handover already exists for a given outgoing shift. */
    java.util.Optional<ShiftHandover> findByOutgoingShiftId(Long outgoingShiftId);
}
