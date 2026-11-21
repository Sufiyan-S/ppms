package com.ppms.supplier;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FuelSupplierRepository extends JpaRepository<FuelSupplier, Long> {

    List<FuelSupplier> findByPumpIdAndActiveTrueOrderByNameAsc(Long pumpId);

    List<FuelSupplier> findByPumpIdOrderByNameAsc(Long pumpId);

    Optional<FuelSupplier> findByIdAndPumpId(Long id, Long pumpId);
}
