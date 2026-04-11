package com.ppms.ancillary;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AncillaryStockDeliveryRepository extends JpaRepository<AncillaryStockDelivery, Long> {

    List<AncillaryStockDelivery> findByPumpIdOrderByDeliveryDateDescCreatedAtDesc(Long pumpId);

    Page<AncillaryStockDelivery> findByPumpIdOrderByDeliveryDateDescCreatedAtDesc(Long pumpId, Pageable pageable);

    List<AncillaryStockDelivery> findByProductIdOrderByDeliveryDateDescCreatedAtDesc(Long productId);
}
