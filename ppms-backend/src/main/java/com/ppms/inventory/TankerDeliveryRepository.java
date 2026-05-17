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

    /** Most recent delivery for a tank — used to inherit cost price when none is provided */
    java.util.Optional<TankerDelivery> findTopByTankIdOrderByDeliveryDateDescCreatedAtDesc(Long tankId);

    /** Most recently entered delivery for a pump (by DB insertion time) — used to identify the latest invoice for deletion */
    java.util.Optional<TankerDelivery> findTopByPumpIdOrderByCreatedAtDesc(Long pumpId);

    /** All deliveries sharing an invoice reference for a pump — covers batch deliveries spanning multiple tanks */
    List<TankerDelivery> findByPumpIdAndInvoiceReference(Long pumpId, String invoiceReference);
}
