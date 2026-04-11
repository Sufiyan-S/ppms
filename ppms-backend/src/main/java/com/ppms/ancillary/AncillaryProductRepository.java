package com.ppms.ancillary;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AncillaryProductRepository extends JpaRepository<AncillaryProduct, Long> {

    List<AncillaryProduct> findByPumpIdAndStatusOrderByNameAsc(Long pumpId, AncillaryProductStatus status);

    List<AncillaryProduct> findByPumpId(Long pumpId);
}
