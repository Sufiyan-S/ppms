package com.ppms.planning;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface StaffPreferenceRepository extends JpaRepository<StaffPreference, Long> {

    Optional<StaffPreference> findByUserId(Long userId);

    List<StaffPreference> findByPumpId(Long pumpId);

    @Modifying
    @Query("DELETE FROM StaffPreference sp WHERE sp.userId = :userId AND sp.pumpId = :pumpId")
    int deleteForUserAtPump(@Param("userId") Long userId, @Param("pumpId") Long pumpId);
}
