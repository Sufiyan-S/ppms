package com.ppms.planning;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StaffPreferenceRepository extends JpaRepository<StaffPreference, Long> {

    Optional<StaffPreference> findByUserId(Long userId);

    List<StaffPreference> findByPumpId(Long pumpId);
}
