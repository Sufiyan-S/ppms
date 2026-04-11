package com.ppms.ancillary;

import com.ppms.common.dto.PagedResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
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

    public List<AncillaryProductResponse> getProducts(Long pumpId) {
        List<AncillaryProduct> products = productRepository.findByPumpId(pumpId);
        if (products.isEmpty()) {
            return List.of();
        }

        Map<Long, List<AncillaryStockLot>> activeLotsByProductId = lotRepository
                .findAllActiveLotsByProductIds(products.stream().map(AncillaryProduct::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(AncillaryStockLot::getProductId));

        return products.stream()
                .map(product -> toProductResponse(product, activeLotsByProductId.getOrDefault(product.getId(), List.of())))
                .toList();
    }

    public PagedResponse<AncillarySaleResponse> getSales(Long pumpId, int page, int size) {
        Page<AncillarySale> salesPage = saleRepository.findByPumpIdOrderBySaleDateDescCreatedAtDesc(
                pumpId, PageRequest.of(page, size));
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
        return toProductResponse(product, lotRepository.findAllActiveLotsByProductIds(List.of(product.getId())));
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

    private AncillaryProductResponse toProductResponse(AncillaryProduct product, List<AncillaryStockLot> activeLots) {
        BigDecimal fifoCostPricePerUnit = activeLots.isEmpty() ? null : activeLots.get(0).getCostPricePerUnit();

        List<AncillaryProductResponse.FifoLotSummary> lotSummaries = activeLots.stream()
                .map(lot -> AncillaryProductResponse.FifoLotSummary.builder()
                        .remainingQuantity(lot.getRemainingQuantity())
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
                .status(product.getStatus().name())
                .createdAt(product.getCreatedAt())
                .updatedAt(product.getUpdatedAt())
                .fifoCostPricePerUnit(fifoCostPricePerUnit)
                .activeFifoLots(lotSummaries)
                .displayName(buildDisplayName(product))
                .build();
    }

    private String buildDisplayName(AncillaryProduct product) {
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
