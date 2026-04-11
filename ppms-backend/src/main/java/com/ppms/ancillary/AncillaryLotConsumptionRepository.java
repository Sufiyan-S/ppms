package com.ppms.ancillary;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AncillaryLotConsumptionRepository extends JpaRepository<AncillaryLotConsumption, Long> {

    List<AncillaryLotConsumption> findBySaleId(Long saleId);

    @Query("SELECT c FROM AncillaryLotConsumption c WHERE c.saleId IN :saleIds")
    List<AncillaryLotConsumption> findBySaleIdIn(List<Long> saleIds);
}
