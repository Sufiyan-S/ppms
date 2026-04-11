package com.ppms.ancillary;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface AncillarySaleRepository extends JpaRepository<AncillarySale, Long> {

    List<AncillarySale> findByPumpIdOrderBySaleDateDescCreatedAtDesc(Long pumpId);

    Page<AncillarySale> findByPumpIdOrderBySaleDateDescCreatedAtDesc(Long pumpId, Pageable pageable);

    List<AncillarySale> findByPumpIdAndSaleDateBetweenOrderBySaleDateAsc(Long pumpId, LocalDate from, LocalDate to);

    @Query("SELECT s FROM AncillarySale s WHERE s.pumpId = :pumpId AND s.saleDate BETWEEN :from AND :to ORDER BY s.saleDate ASC")
    List<AncillarySale> findByPumpIdAndDateRange(Long pumpId, LocalDate from, LocalDate to);
}
