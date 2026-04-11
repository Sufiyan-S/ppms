package com.ppms.ancillary;

import com.ppms.cash.CashEvent;
import com.ppms.cash.CashEventRepository;
import com.ppms.cash.CashEventType;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
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

        AncillaryStockDelivery delivery = deliveryRepository.save(AncillaryStockDelivery.builder()
                .productId(product.getId())
                .pumpId(pumpId)
                .quantityUnits(request.getQuantityUnits())
                .costPricePerUnit(request.getCostPricePerUnit().setScale(2, RoundingMode.HALF_UP))
                .deliveryDate(request.getDeliveryDate())
                .invoiceReference(request.getInvoiceReference() != null ? request.getInvoiceReference().trim() : null)
                .notes(request.getNotes())
                .loggedByUserId(currentUser.getId())
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
