package com.ppms.supplier;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FuelSupplierRepository extends JpaRepository<FuelSupplier, Long> {

    List<FuelSupplier> findByPumpIdAndActiveTrueOrderByNameAsc(Long pumpId);

    List<FuelSupplier> findByPumpIdOrderByNameAsc(Long pumpId);
}
