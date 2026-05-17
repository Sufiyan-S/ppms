package com.ppms.inventory;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface TankerRepository extends JpaRepository<Tanker, Long> {

    List<Tanker> findByPumpIdAndActiveTrueOrderByNameAsc(Long pumpId);

    Optional<Tanker> findByPumpIdAndDefaultTankerTrueAndActiveTrue(Long pumpId);

    @Modifying
    @Query("UPDATE Tanker t SET t.defaultTanker = false WHERE t.pumpId = :pumpId")
    void clearAllDefaultsForPump(@Param("pumpId") Long pumpId);
}
