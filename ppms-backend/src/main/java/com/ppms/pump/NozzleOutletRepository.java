package com.ppms.pump;

import com.ppms.fuel.FuelType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface NozzleOutletRepository extends JpaRepository<NozzleOutlet, Long> {

    List<NozzleOutlet> findByNozzleId(Long nozzleId);

    Optional<NozzleOutlet> findByNozzleIdAndFuelType(Long nozzleId, FuelType fuelType);

    boolean existsByNozzleIdAndFuelType(Long nozzleId, FuelType fuelType);

    void deleteByNozzleId(Long nozzleId);
}
