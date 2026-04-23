package com.ppms.ancillary;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface AncillaryProductPriceRepository extends JpaRepository<AncillaryProductPrice, Long> {

    /** Returns the currently active selling price for a product (latest effective_from). */
    Optional<AncillaryProductPrice> findFirstByProductIdOrderByEffectiveFromDesc(Long productId);

    /** Full price history for a product, newest first. */
    List<AncillaryProductPrice> findByProductIdOrderByEffectiveFromDesc(Long productId);

    /**
     * Returns the most recently set price for a product on or before a given point in time.
     * Used during backfill to resolve the historical price that was in effect on the sale date.
     * Pass end-of-day IST on the sale date as {@code asOf} to capture any price set that day.
     */
    Optional<AncillaryProductPrice> findFirstByProductIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
            Long productId, OffsetDateTime asOf);

    /**
     * Returns the latest price row for each product in the supplied list, in a single query.
     * Used by the product list endpoint to avoid N+1 (one price query per product).
     * Products with no price set will simply be absent from the result map.
     */
    @Query("""
            SELECT p FROM AncillaryProductPrice p
            WHERE p.productId IN :productIds
              AND p.effectiveFrom = (
                  SELECT MAX(p2.effectiveFrom) FROM AncillaryProductPrice p2
                  WHERE p2.productId = p.productId
              )
            """)
    List<AncillaryProductPrice> findLatestPricesForProducts(List<Long> productIds);
}
