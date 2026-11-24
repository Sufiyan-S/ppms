package com.ppms.ancillary;

import com.ppms.common.dto.PageRequests;
import com.ppms.common.dto.PagedResponse;
import com.ppms.common.time.BusinessClock;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AncillaryProductQueryService {

    private final AncillaryProductRepository productRepository;
    private final AncillaryStockLotRepository lotRepository;
    private final AncillaryStockDeliveryRepository deliveryRepository;
    private final AncillarySaleRepository saleRepository;
    private final AncillaryProductPriceRepository priceRepository;
    private final BusinessClock businessClock;

    public List<AncillaryProductResponse> getProducts(Long pumpId) {
        List<AncillaryProduct> products = productRepository.findByPumpId(pumpId);
        if (products.isEmpty()) {
            return List.of();
        }

        List<Long> productIds = products.stream().map(AncillaryProduct::getId).toList();
        Map<Long, List<AncillaryStockLot>> activeLotsByProductId = lotRepository
                .findAllActiveLotsByProductIds(productIds)
                .stream()
                .collect(Collectors.groupingBy(AncillaryStockLot::getProductId));
        Map<Long, BigDecimal> currentPriceByProductId = currentPricesFor(productIds);
        Map<Long, SoldToday> soldTodayByProductId = soldTodayFor(pumpId, productIds);

        return products.stream()
                .map(product -> toProductResponse(product,
                        activeLotsByProductId.getOrDefault(product.getId(), List.of()),
                        currentPriceByProductId.get(product.getId()),
                        soldTodayByProductId.getOrDefault(product.getId(), SoldToday.NONE)))
                .toList();
    }

    public PagedResponse<AncillarySaleResponse> getSales(Long pumpId, int page, int size) {
        Page<AncillarySale> salesPage = saleRepository.findByPumpIdOrderBySaleDateDescCreatedAtDesc(
                pumpId, PageRequests.of(page, size));
        Map<Long, AncillaryProduct> productById = productRepository.findAllById(
                        salesPage.getContent().stream().map(AncillarySale::getProductId).collect(Collectors.toSet()))
                .stream()
                .collect(Collectors.toMap(AncillaryProduct::getId, Function.identity()));
        return PagedResponse.of(salesPage.map(sale -> toSaleResponse(sale, productById.get(sale.getProductId()))));
    }

    public List<AncillaryLotDetailResponse> getActiveLots(Long productId) {
        List<AncillaryStockLot> lots = lotRepository
                .findByProductIdAndStatusOrderByDeliveryDateAscIdAsc(productId, AncillaryLotStatus.ACTIVE);
        if (lots.isEmpty()) {
            return List.of();
        }

        Map<Long, AncillaryStockDelivery> deliveryById = deliveryRepository.findAllById(
                        lots.stream().map(AncillaryStockLot::getDeliveryId).distinct().toList())
                .stream()
                .collect(Collectors.toMap(AncillaryStockDelivery::getId, Function.identity()));

        return lots.stream()
                .map(lot -> toLotDetailResponse(lot, deliveryById.get(lot.getDeliveryId())))
                .toList();
    }

    public AncillaryProductResponse toProductResponseWithLots(AncillaryProduct product) {
        List<Long> productIds = List.of(product.getId());
        return toProductResponse(product,
                lotRepository.findAllActiveLotsByProductIds(productIds),
                currentPricesFor(productIds).get(product.getId()),
                soldTodayFor(product.getPumpId(), productIds).getOrDefault(product.getId(), SoldToday.NONE));
    }

    private Map<Long, SoldToday> soldTodayFor(Long pumpId, List<Long> productIds) {
        return saleRepository.sumSalesByProductIdsOnDate(pumpId, productIds, businessClock.today())
                .stream()
                .collect(Collectors.toMap(row -> (Long) row[0],
                        row -> new SoldToday(((Number) row[1]).intValue(), (BigDecimal) row[2])));
    }

    private record SoldToday(int units, BigDecimal amount) {
        static final SoldToday NONE = new SoldToday(0, BigDecimal.ZERO.setScale(2));
    }

    private Map<Long, BigDecimal> currentPricesFor(List<Long> productIds) {
        return priceRepository.findPricesInEffectForProducts(productIds, businessClock.now())
                .stream()
                .collect(Collectors.toMap(AncillaryProductPrice::getProductId, AncillaryProductPrice::getPricePerUnit));
    }

    public AncillarySaleResponse toSaleResponse(AncillarySale sale, AncillaryProduct product) {
        String displayName = product != null ? buildDisplayName(product) : "Unknown Product";
        return AncillarySaleResponse.builder()
                .id(sale.getId())
                .pumpId(sale.getPumpId())
                .productId(sale.getProductId())
                .productDisplayName(displayName)
                .quantityUnits(sale.getQuantityUnits())
                .sellingPricePerUnit(sale.getSellingPricePerUnit())
                .totalAmount(sale.getTotalAmount())
                .gstAmount(sale.getGstAmount())
                .totalWithGst(sale.getTotalWithGst())
                .paymentMode(sale.getPaymentMode().name())
                .clientId(sale.getClientId())
                .clientName(sale.getClientName())
                .billNo(sale.getBillNo())
                .notes(sale.getNotes())
                .soldByUserId(sale.getSoldByUserId())
                .saleDate(sale.getSaleDate())
                .isBackfilled(sale.isBackfilled())
                .createdAt(sale.getCreatedAt())
                .build();
    }

    public AncillaryLotDetailResponse toLotDetailResponse(AncillaryStockLot lot, AncillaryStockDelivery delivery) {
        return AncillaryLotDetailResponse.builder()
                .id(lot.getId())
                .deliveryId(lot.getDeliveryId())
                .deliveryDate(lot.getDeliveryDate())
                .invoiceReference(delivery != null ? delivery.getInvoiceReference() : null)
                .costPricePerUnit(lot.getCostPricePerUnit())
                .remainingQuantity(lot.getRemainingQuantity())
                .originalQuantity(lot.getOriginalQuantity())
                .status(lot.getStatus().name())
                .createdAt(lot.getCreatedAt())
                .build();
    }

    private AncillaryProductResponse toProductResponse(AncillaryProduct product, List<AncillaryStockLot> activeLots,
                                                       BigDecimal currentSellingPricePerUnit, SoldToday soldToday) {
        BigDecimal fifoCostPricePerUnit = activeLots.isEmpty() ? null : activeLots.get(0).getCostPricePerUnit();

        List<AncillaryProductResponse.FifoLotSummary> lotSummaries = activeLots.stream()
                .map(lot -> AncillaryProductResponse.FifoLotSummary.builder()
                        .remainingQuantity(lot.getRemainingQuantity())
                        .originalQuantity(lot.getOriginalQuantity())
                        .costPricePerUnit(lot.getCostPricePerUnit())
                        .build())
                .toList();

        return AncillaryProductResponse.builder()
                .id(product.getId())
                .pumpId(product.getPumpId())
                .name(product.getName())
                .brand(product.getBrand())
                .variant(product.getVariant())
                .packageSize(product.getPackageSize())
                .unitOfMeasure(product.getUnitOfMeasure().name())
                .currentStockUnits(product.getCurrentStockUnits())
                .lowStockThreshold(product.getLowStockThreshold())
                .hsnCode(product.getHsnCode())
                .status(product.getStatus().name())
                .createdAt(product.getCreatedAt())
                .updatedAt(product.getUpdatedAt())
                .fifoCostPricePerUnit(fifoCostPricePerUnit)
                .activeFifoLots(lotSummaries)
                .currentSellingPricePerUnit(currentSellingPricePerUnit)
                .soldTodayUnits(soldToday.units())
                .soldTodayAmount(soldToday.amount())
                .displayName(buildDisplayName(product))
                .build();
    }

    public static String buildDisplayName(AncillaryProduct product) {
        StringBuilder sb = new StringBuilder();
        if (product.getBrand() != null && !product.getBrand().isBlank()) {
            sb.append(product.getBrand()).append(' ');
        }
        sb.append(product.getName());
        if (product.getVariant() != null && !product.getVariant().isBlank()) {
            sb.append(' ').append(product.getVariant());
        }
        sb.append(" — ")
                .append(product.getPackageSize().stripTrailingZeros().toPlainString())
                .append(' ')
                .append(product.getUnitOfMeasure().name());
        return sb.toString();
    }
}
