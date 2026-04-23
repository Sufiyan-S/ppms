package com.ppms.ancillary;

import com.ppms.cash.CashEvent;
import com.ppms.cash.CashEventRepository;
import com.ppms.cash.CashEventType;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.settlement.PaymentSettlement;
import com.ppms.settlement.PaymentSettlementRepository;
import com.ppms.settlement.SettlementPaymentType;
import com.ppms.transaction.TransactionPaymentMode;
import com.ppms.user.User;
import lombok.Builder;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AncillaryInventoryWorkflowService {

    private final AncillaryProductRepository productRepository;
    private final AncillaryProductPriceRepository priceRepository;
    private final AncillaryStockDeliveryRepository deliveryRepository;
    private final AncillaryStockLotRepository lotRepository;
    private final AncillaryLotConsumptionRepository consumptionRepository;
    private final AncillarySaleRepository saleRepository;
    private final CashEventRepository cashEventRepository;
    private final PaymentSettlementRepository settlementRepository;
    private final AncillaryProductAccessService accessService;

    @Transactional
    public AncillaryProduct createProduct(Long pumpId, CreateProductRequest request) {
        BigDecimal gstRate = request.getGstRatePercent() != null
                ? request.getGstRatePercent().setScale(2, RoundingMode.HALF_UP)
                : new BigDecimal("18.00");

        AncillaryProduct product = AncillaryProduct.builder()
                .pumpId(pumpId)
                .name(request.getName().trim())
                .brand(request.getBrand() != null ? request.getBrand().trim() : null)
                .variant(request.getVariant() != null ? request.getVariant().trim() : null)
                .packageSize(request.getPackageSize().setScale(3, RoundingMode.HALF_UP))
                .unitOfMeasure(request.getUnitOfMeasure())
                .currentStockUnits(0)
                .lowStockThreshold(request.getLowStockThreshold())
                .gstRatePercent(gstRate)
                .status(AncillaryProductStatus.ACTIVE)
                .build();

        return productRepository.save(product);
    }

    @Transactional
    public AncillaryProduct updateProduct(Long pumpId, Long productId, UpdateProductRequest request) {
        AncillaryProduct product = accessService.requireProductForPump(productId, pumpId);
        if (request.getBrand() != null) {
            product.setBrand(request.getBrand().isBlank() ? null : request.getBrand().trim());
        }
        if (request.getVariant() != null) {
            product.setVariant(request.getVariant().isBlank() ? null : request.getVariant().trim());
        }
        product.setLowStockThreshold(request.getLowStockThreshold());
        if (request.getGstRatePercent() != null) {
            product.setGstRatePercent(request.getGstRatePercent().setScale(2, RoundingMode.HALF_UP));
        }
        return productRepository.save(product);
    }

    @Transactional
    public AncillaryProduct setProductStatus(Long pumpId, Long productId, AncillaryProductStatus status) {
        AncillaryProduct product = accessService.requireProductForPump(productId, pumpId);
        product.setStatus(status);
        return productRepository.save(product);
    }

    @Transactional
    public AncillaryProductPrice setPrice(Long pumpId, Long productId, SetProductPriceRequest request, User currentUser) {
        AncillaryProduct product = accessService.requireProductForPump(productId, pumpId);
        AncillaryProductPrice price = AncillaryProductPrice.builder()
                .productId(product.getId())
                .pumpId(pumpId)
                .pricePerUnit(request.getPricePerUnit().setScale(2, RoundingMode.HALF_UP))
                .effectiveFrom(OffsetDateTime.now())
                .setByUserId(currentUser.getId())
                .build();
        return priceRepository.save(price);
    }

    @Transactional
    public DeliveryResult recordDelivery(Long pumpId, Long productId, RecordStockDeliveryRequest request, User currentUser) {
        AncillaryProduct product = accessService.requireProductForPump(productId, pumpId);
        if (product.getStatus() == AncillaryProductStatus.INACTIVE) {
            throw new BusinessException("Product '" + product.getName() + "' is INACTIVE. Re-activate it before recording a delivery.");
        }

        // Mark as backfilled when the delivery date is before today — historical entry.
        boolean isBackfilled = request.getDeliveryDate().isBefore(LocalDate.now(ZoneId.of("Asia/Kolkata")));

        AncillaryStockDelivery delivery = deliveryRepository.save(AncillaryStockDelivery.builder()
                .productId(product.getId())
                .pumpId(pumpId)
                .quantityUnits(request.getQuantityUnits())
                .costPricePerUnit(request.getCostPricePerUnit().setScale(2, RoundingMode.HALF_UP))
                .deliveryDate(request.getDeliveryDate())
                .invoiceReference(request.getInvoiceReference() != null ? request.getInvoiceReference().trim() : null)
                .notes(request.getNotes())
                .loggedByUserId(currentUser.getId())
                .isBackfilled(isBackfilled)
                .build());

        AncillaryStockLot lot = lotRepository.save(AncillaryStockLot.builder()
                .deliveryId(delivery.getId())
                .productId(product.getId())
                .pumpId(pumpId)
                .originalQuantity(request.getQuantityUnits())
                .remainingQuantity(request.getQuantityUnits())
                .costPricePerUnit(delivery.getCostPricePerUnit())
                .deliveryDate(request.getDeliveryDate())
                .status(AncillaryLotStatus.ACTIVE)
                .build());

        product.setCurrentStockUnits(product.getCurrentStockUnits() + request.getQuantityUnits());
        productRepository.save(product);

        return DeliveryResult.builder()
                .product(product)
                .delivery(delivery)
                .lot(lot)
                .build();
    }

    @Transactional
    public SaleResult recordSale(Long pumpId, RecordAncillarySaleRequest request, User currentUser) {
        AncillaryProduct product = accessService.requireProductForPump(request.getProductId(), pumpId);
        if (product.getStatus() == AncillaryProductStatus.INACTIVE) {
            throw new BusinessException("Product '" + product.getName() + "' is INACTIVE and cannot be sold.");
        }
        if (request.getPaymentMode() == TransactionPaymentMode.CREDIT
                && (request.getClientName() == null || request.getClientName().isBlank())) {
            throw new BusinessException("Client name is required for CREDIT payment mode.");
        }
        if (product.getCurrentStockUnits() < request.getQuantityUnits()) {
            throw new BusinessException(
                    "Insufficient stock for '" + product.getName() + "'. Available: "
                            + product.getCurrentStockUnits() + " units, requested: " + request.getQuantityUnits() + " units.");
        }

        BigDecimal sellingPrice = request.getSellingPricePerUnit().setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalAmount = sellingPrice.multiply(new BigDecimal(request.getQuantityUnits()))
                .setScale(2, RoundingMode.HALF_UP);

        AncillarySale sale = saleRepository.save(AncillarySale.builder()
                .pumpId(pumpId)
                .productId(product.getId())
                .quantityUnits(request.getQuantityUnits())
                .sellingPricePerUnit(sellingPrice)
                .totalAmount(totalAmount)
                .gstAmount(BigDecimal.ZERO.setScale(2))
                .totalWithGst(totalAmount)
                .paymentMode(request.getPaymentMode())
                .clientId(request.getClientId())
                .clientName(request.getClientName() != null ? request.getClientName().trim() : null)
                .billNo(request.getBillNo() != null ? request.getBillNo().trim() : null)
                .notes(request.getNotes())
                .soldByUserId(currentUser.getId())
                .saleDate(LocalDate.now())
                .build());

        deductFromLots(product.getId(), sale.getId(), request.getQuantityUnits());
        product.setCurrentStockUnits(product.getCurrentStockUnits() - request.getQuantityUnits());
        productRepository.save(product);

        CashEvent cashEvent = null;
        if (request.getPaymentMode() == TransactionPaymentMode.CASH) {
            cashEvent = cashEventRepository.save(CashEvent.builder()
                    .pumpId(pumpId)
                    .eventType(CashEventType.CASH_IN)
                    .amount(totalAmount)
                    .description("Counter sale: " + product.getName() + " × " + request.getQuantityUnits() + " units (Sale #" + sale.getId() + ")")
                    .eventDate(LocalDate.now())
                    .recordedByUserId(currentUser.getId())
                    .build());
        }

        return SaleResult.builder()
                .product(product)
                .sale(sale)
                .cashEvent(cashEvent)
                .build();
    }

    @Transactional
    public LotCorrectionResult updateLot(Long pumpId, Long lotId, UpdateLotRequest request) {
        AncillaryStockLot lot = accessService.requireLotForPump(lotId, pumpId);
        AncillaryProduct product = productRepository.findById(lot.getProductId())
                .orElseThrow(() -> new ResourceNotFoundException("Product not found for lot: " + lotId));

        if (request.getRemainingQuantity() != null) {
            int newQty = request.getRemainingQuantity();
            if (newQty < 0) {
                throw new BusinessException("Remaining quantity cannot be negative.");
            }
            if (newQty > lot.getOriginalQuantity()) {
                throw new BusinessException(
                        "Remaining quantity cannot exceed original quantity (" + lot.getOriginalQuantity() + ").");
            }
            int delta = newQty - lot.getRemainingQuantity();
            lot.setRemainingQuantity(newQty);
            lot.setStatus(newQty == 0 ? AncillaryLotStatus.EXHAUSTED : AncillaryLotStatus.ACTIVE);
            product.setCurrentStockUnits(product.getCurrentStockUnits() + delta);
            productRepository.save(product);
        }

        if (request.getCostPricePerUnit() != null) {
            if (request.getCostPricePerUnit().compareTo(BigDecimal.ZERO) <= 0) {
                throw new BusinessException("Cost price must be greater than 0.");
            }
            lot.setCostPricePerUnit(request.getCostPricePerUnit().setScale(2, RoundingMode.HALF_UP));
        }

        AncillaryStockLot savedLot = lotRepository.save(lot);
        AncillaryStockDelivery delivery = deliveryRepository.findById(savedLot.getDeliveryId()).orElse(null);
        return LotCorrectionResult.builder()
                .lot(savedLot)
                .delivery(delivery)
                .build();
    }

    /**
     * Retroactively records a historical counter sale.
     *
     * Business rules enforced:
     * 1. saleDate must be strictly before today (IST).
     * 2. A selling price must have been set on or before saleDate — resolved from price history.
     * 3. At least one active stock lot must have a deliveryDate ≤ saleDate.
     * 4. The total remaining quantity across those historical lots must cover the request.
     * 5. Only ADMIN and OWNER roles are allowed (enforced at the controller layer).
     *
     * The FIFO deduction is restricted to lots whose deliveryDate ≤ saleDate so that
     * stock that arrived AFTER the sale date is never consumed retroactively.
     */
    @Transactional
    public SaleResult backfillSale(Long pumpId, BackfillSaleRequest request, User currentUser) {
        ZoneId ist = ZoneId.of("Asia/Kolkata");

        // 1. Validate saleDate is strictly in the past
        if (!request.getSaleDate().isBefore(LocalDate.now(ist))) {
            throw new BusinessException(
                    "Sale date must be strictly in the past. Use the regular Sell button for today's sales.");
        }

        if (request.getPaymentMode() == com.ppms.transaction.TransactionPaymentMode.CREDIT
                && (request.getClientName() == null || request.getClientName().isBlank())) {
            throw new BusinessException("Client name is required for CREDIT payment mode.");
        }

        // 2. Load product
        AncillaryProduct product = accessService.requireProductForPump(request.getProductId(), pumpId);

        // 3. Resolve price effective on saleDate.
        //    Use start-of-next-day IST as the upper bound so prices set anytime on saleDate
        //    are included.
        OffsetDateTime endOfSaleDay = request.getSaleDate().plusDays(1)
                .atStartOfDay(ist)
                .toOffsetDateTime();
        AncillaryProductPrice historicalPrice = priceRepository
                .findFirstByProductIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
                        request.getProductId(), endOfSaleDay)
                .orElseThrow(() -> new BusinessException(
                        "No selling price was set for '" + product.getName() +
                        "' on or before " + request.getSaleDate() +
                        ". Set a price first (even a historical one) before backfilling this sale."));

        // 4. Fetch active lots delivered on or before saleDate (pessimistic lock).
        List<AncillaryStockLot> historicalLots = lotRepository
                .findActiveLotsByProductAvailableOnDate(request.getProductId(), request.getSaleDate());

        // 5. Check total available quantity across those historical lots.
        int availableOnDate = historicalLots.stream()
                .mapToInt(AncillaryStockLot::getRemainingQuantity)
                .sum();
        if (availableOnDate < request.getQuantityUnits()) {
            throw new BusinessException(
                    "Insufficient historical stock for '" + product.getName() +
                    "' on " + request.getSaleDate() +
                    ". Stock available from lots delivered on or before that date: " + availableOnDate +
                    " units. Requested: " + request.getQuantityUnits() +
                    " units. Record a historical stock delivery first.");
        }

        // 6. Compute amounts using the historical price.
        BigDecimal sellingPrice = historicalPrice.getPricePerUnit();
        BigDecimal totalAmount = sellingPrice.multiply(new BigDecimal(request.getQuantityUnits()))
                .setScale(2, RoundingMode.HALF_UP);

        // 7. Persist the sale (is_backfilled = true, saleDate = historical date).
        AncillarySale sale = saleRepository.save(AncillarySale.builder()
                .pumpId(pumpId)
                .productId(product.getId())
                .quantityUnits(request.getQuantityUnits())
                .sellingPricePerUnit(sellingPrice)
                .totalAmount(totalAmount)
                .gstAmount(BigDecimal.ZERO.setScale(2))
                .totalWithGst(totalAmount)
                .paymentMode(request.getPaymentMode())
                .clientName(request.getClientName() != null ? request.getClientName().trim() : null)
                .billNo(request.getBillNo() != null ? request.getBillNo().trim() : null)
                .notes(request.getNotes())
                .soldByUserId(currentUser.getId())
                .saleDate(request.getSaleDate())
                .isBackfilled(true)
                .build());

        // 8. FIFO deduction — restricted to lots available on the historical date.
        deductFromSpecificLots(historicalLots, sale.getId(), request.getQuantityUnits());

        // 9. Decrement live product stock.
        product.setCurrentStockUnits(product.getCurrentStockUnits() - request.getQuantityUnits());
        productRepository.save(product);

        // 10. Cash event dated to the historical sale date for correct daily cash reconciliation.
        CashEvent cashEvent = null;
        if (request.getPaymentMode() == com.ppms.transaction.TransactionPaymentMode.CASH) {
            cashEvent = cashEventRepository.save(CashEvent.builder()
                    .pumpId(pumpId)
                    .eventType(CashEventType.CASH_IN)
                    .amount(totalAmount)
                    .description("Backfilled sale: " + product.getName() +
                            " × " + request.getQuantityUnits() + " units (Sale #" + sale.getId() + ")")
                    .eventDate(request.getSaleDate())
                    .recordedByUserId(currentUser.getId())
                    .build());
        }

        // 11. Auto-settle digital payments from this backfilled sale.
        // Past-date sales are assumed to have already been received in the bank —
        // auto-creating a settlement record keeps the wallet pending balance accurate.
        SettlementPaymentType settlementType = toSettlementType(request.getPaymentMode());
        if (settlementType != null) {
            settlementRepository.save(PaymentSettlement.builder()
                    .pumpId(pumpId)
                    .paymentType(settlementType)
                    .settlementDate(request.getSaleDate())
                    .amountReceived(totalAmount)
                    .notes("Auto-settled from backfilled product sale #" + sale.getId())
                    .recordedByUserId(currentUser.getId())
                    .build());
            log.info("Auto-settled backfilled product {} payment: pump={}, saleId={}, amount={}, date={}",
                    settlementType, pumpId, sale.getId(), totalAmount, request.getSaleDate());
        }

        log.info("Ancillary sale backfilled: pump={}, productId={}, saleId={}, saleDate={}, units={}, price={}, by={}",
                pumpId, product.getId(), sale.getId(), request.getSaleDate(),
                request.getQuantityUnits(), sellingPrice, currentUser.getId());

        return SaleResult.builder()
                .product(product)
                .sale(sale)
                .cashEvent(cashEvent)
                .build();
    }

    private void deductFromLots(Long productId, Long saleId, int unitsToDeduct) {
        List<AncillaryStockLot> lots = lotRepository.findActiveLotsByProductFifo(productId);
        int remaining = unitsToDeduct;

        for (AncillaryStockLot lot : lots) {
            if (remaining <= 0) {
                break;
            }

            int consume = Math.min(remaining, lot.getRemainingQuantity());
            lot.setRemainingQuantity(lot.getRemainingQuantity() - consume);
            if (lot.getRemainingQuantity() == 0) {
                lot.setStatus(AncillaryLotStatus.EXHAUSTED);
            }
            lotRepository.save(lot);

            consumptionRepository.save(AncillaryLotConsumption.builder()
                    .lotId(lot.getId())
                    .saleId(saleId)
                    .quantityConsumed(consume)
                    .costPricePerUnit(lot.getCostPricePerUnit())
                    .build());

            remaining -= consume;
        }

        if (remaining > 0) {
            log.warn("Ancillary stock lot shortage: productId={}, saleId={}, {} units not covered by any lot. This indicates a stock count vs lot quantity drift — investigate.",
                    productId, saleId, remaining);
        }
    }

    /**
     * FIFO deduction across a pre-loaded, pre-locked list of lots.
     * Used by backfillSale() to restrict deduction to historically available lots.
     * The caller is responsible for fetching lots with a pessimistic write lock.
     */
    private void deductFromSpecificLots(List<AncillaryStockLot> lots, Long saleId, int unitsToDeduct) {
        int remaining = unitsToDeduct;

        for (AncillaryStockLot lot : lots) {
            if (remaining <= 0) break;

            int consume = Math.min(remaining, lot.getRemainingQuantity());
            lot.setRemainingQuantity(lot.getRemainingQuantity() - consume);
            if (lot.getRemainingQuantity() == 0) {
                lot.setStatus(AncillaryLotStatus.EXHAUSTED);
            }
            lotRepository.save(lot);

            consumptionRepository.save(AncillaryLotConsumption.builder()
                    .lotId(lot.getId())
                    .saleId(saleId)
                    .quantityConsumed(consume)
                    .costPricePerUnit(lot.getCostPricePerUnit())
                    .build());

            remaining -= consume;
        }

        if (remaining > 0) {
            log.warn("Backfill sale lot shortage: saleId={}, {} units not covered by historical lots. Investigate lot state.",
                    saleId, remaining);
        }
    }

    /**
     * Maps a TransactionPaymentMode to its corresponding SettlementPaymentType.
     * Returns null for CASH and CREDIT — those modes do not require settlement tracking.
     */
    private static SettlementPaymentType toSettlementType(TransactionPaymentMode mode) {
        return switch (mode) {
            case UPI        -> SettlementPaymentType.UPI;
            case CARD       -> SettlementPaymentType.CARD;
            case FLEET_CARD -> SettlementPaymentType.FLEET_CARD;
            default         -> null;
        };
    }

    @Getter
    @Builder
    public static class DeliveryResult {
        private AncillaryProduct product;
        private AncillaryStockDelivery delivery;
        private AncillaryStockLot lot;
    }

    @Getter
    @Builder
    public static class SaleResult {
        private AncillaryProduct product;
        private AncillarySale sale;
        private CashEvent cashEvent;
    }

    @Getter
    @Builder
    public static class LotCorrectionResult {
        private AncillaryStockLot lot;
        private AncillaryStockDelivery delivery;
    }
}
