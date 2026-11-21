package com.ppms.ancillary;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AncillaryProductRepository extends JpaRepository<AncillaryProduct, Long> {

    List<AncillaryProduct> findByPumpIdAndStatusOrderByNameAsc(Long pumpId, AncillaryProductStatus status);

    List<AncillaryProduct> findByPumpId(Long pumpId);

    // Every path that changes currentStockUnits must hold this lock, taken before any stock lot lock.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM AncillaryProduct p WHERE p.id = :id AND p.pumpId = :pumpId")
    Optional<AncillaryProduct> findByIdAndPumpIdForUpdate(@Param("id") Long id, @Param("pumpId") Long pumpId);
}
