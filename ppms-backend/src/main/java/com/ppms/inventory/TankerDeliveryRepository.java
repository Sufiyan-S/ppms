package com.ppms.inventory;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;

@Repository
public interface TankerDeliveryRepository extends JpaRepository<TankerDelivery, Long> {

    List<TankerDelivery> findByPumpIdOrderByDeliveryDateDesc(Long pumpId);

    boolean existsByIdAndPumpId(Long id, Long pumpId);

    Page<TankerDelivery> findByPumpIdOrderByDeliveryDateDesc(Long pumpId, Pageable pageable);

    /** Deliveries dated within [from, to) — used by DAY balance sheet */
    List<TankerDelivery> findByPumpIdAndDeliveryDateGreaterThanEqualAndDeliveryDateLessThan(
            Long pumpId, OffsetDateTime from, OffsetDateTime to);

    boolean existsByPumpIdAndInvoiceReferenceAndTankId(Long pumpId, String invoiceReference, Long tankId);

    boolean existsByPumpIdAndInvoiceReferenceAndTankIdAndIdNot(Long pumpId, String invoiceReference, Long tankId, Long id);

    /** Most recent delivery for a tank — used to inherit cost price when none is provided */
    java.util.Optional<TankerDelivery> findTopByTankIdOrderByDeliveryDateDescCreatedAtDesc(Long tankId);

    /** Most recently entered delivery for a pump (by DB insertion time) — used to identify the latest invoice for deletion */
    java.util.Optional<TankerDelivery> findTopByPumpIdOrderByCreatedAtDesc(Long pumpId);

    /** All deliveries sharing an invoice reference for a pump — covers batch deliveries spanning multiple tanks */
    List<TankerDelivery> findByPumpIdAndInvoiceReference(Long pumpId, String invoiceReference);

    boolean existsByPumpId(Long pumpId);

    boolean existsByTankId(Long tankId);
}
