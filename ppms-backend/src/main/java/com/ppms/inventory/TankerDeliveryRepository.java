package com.ppms.inventory;

import com.ppms.fuel.FuelType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;

@Repository
public interface TankerDeliveryRepository extends JpaRepository<TankerDelivery, Long> {

    List<TankerDelivery> findByPumpIdOrderByDeliveryDateDesc(Long pumpId);

    Page<TankerDelivery> findByPumpIdOrderByDeliveryDateDesc(Long pumpId, Pageable pageable);

    /** Deliveries for a pump within a UTC time window — used by DAY balance sheet */
    List<TankerDelivery> findByPumpIdAndDeliveryDateBetween(
            Long pumpId, OffsetDateTime from, OffsetDateTime to);

    /** Duplicate guard: checks whether the same fuel type is already recorded under this invoice for this pump */
    boolean existsByPumpIdAndInvoiceReferenceAndFuelType(Long pumpId, String invoiceReference, FuelType fuelType);

    /** Duplicate guard for edits: same as above but excludes the delivery being edited */
    boolean existsByPumpIdAndInvoiceReferenceAndFuelTypeAndIdNot(Long pumpId, String invoiceReference, FuelType fuelType, Long id);
}
