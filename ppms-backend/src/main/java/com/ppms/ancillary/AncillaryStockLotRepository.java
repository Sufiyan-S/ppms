package com.ppms.ancillary;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AncillaryStockLotRepository extends JpaRepository<AncillaryStockLot, Long> {

    /**
     * FIFO ordering: returns active lots for a product, oldest delivery date first.
     * The tiebreaker is lot ID (insertion order) for same-day deliveries.
     * This ensures costs are consumed in the order they were incurred.
     */
    // PESSIMISTIC_WRITE lock prevents two concurrent sale transactions for the same product
    // from deducting from the same lot simultaneously — same race condition risk as fuel FIFO.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT l FROM AncillaryStockLot l WHERE l.productId = :productId AND l.status = 'ACTIVE' ORDER BY l.deliveryDate ASC, l.id ASC")
    List<AncillaryStockLot> findActiveLotsByProductFifo(Long productId);

    /**
     * Batch-loads the oldest active FIFO lot per product.
     * Returns one lot per product — the one whose cost price would be consumed next on a sale.
     * Used when building the product list response to avoid N+1 queries.
     * MIN(id) is used as the FIFO tiebreaker for same-day deliveries.
     */
    @Query("SELECT l FROM AncillaryStockLot l WHERE l.id IN (" +
           "  SELECT MIN(l2.id) FROM AncillaryStockLot l2" +
           "  WHERE l2.productId IN :productIds AND l2.status = 'ACTIVE'" +
           "  GROUP BY l2.productId" +
           ")")
    List<AncillaryStockLot> findOldestActiveLotPerProduct(List<Long> productIds);

    /**
     * Batch-loads ALL active FIFO lots for the given products, in FIFO consumption order.
     * Returns all lots across all products — caller groups by productId.
     * No pessimistic lock — used for display purposes only (profit preview in SellDialog).
     * Ordering ensures the UI can walk lots in the same order as deductFromLots().
     */
    @Query("SELECT l FROM AncillaryStockLot l WHERE l.productId IN :productIds AND l.status = 'ACTIVE' ORDER BY l.productId ASC, l.deliveryDate ASC, l.id ASC")
    List<AncillaryStockLot> findAllActiveLotsByProductIds(List<Long> productIds);

    /**
     * Returns only ACTIVE lots for a single product in FIFO order.
     * Used by the Stock Lots dialog — exhausted lots are excluded so the user sees
     * only remaining stock with their delivery date, bill number, and cost price.
     */
    List<AncillaryStockLot> findByProductIdAndStatusOrderByDeliveryDateAscIdAsc(
            Long productId, AncillaryLotStatus status);
}
