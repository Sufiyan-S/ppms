package com.ppms.ancillary;

import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ResourceNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AncillaryProductAccessService {

    private final AncillaryProductRepository productRepository;
    private final AncillaryStockLotRepository lotRepository;

    public AncillaryProductAccessService(AncillaryProductRepository productRepository,
                                         AncillaryStockLotRepository lotRepository) {
        this.productRepository = productRepository;
        this.lotRepository = lotRepository;
    }

    public AncillaryProduct requireProductForPump(Long productId, Long pumpId) {
        AncillaryProduct product = productRepository.findById(productId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PRODUCT,
                        "Ancillary product not found: " + productId));
        if (!product.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.PRODUCT, "Product not found");
        }
        return product;
    }

    public AncillaryProduct requireProductForPumpForUpdate(Long productId, Long pumpId) {
        return productRepository.findByIdAndPumpIdForUpdate(productId, pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PRODUCT,
                        "Ancillary product not found: " + productId));
    }

    public Long requireProductIdOfLot(Long lotId, Long pumpId) {
        return lotRepository.findProductIdByIdAndPumpId(lotId, pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.STOCK_LOT,
                        "Stock lot not found: " + lotId));
    }

    public AncillaryStockLot requireLotForPump(Long lotId, Long pumpId) {
        AncillaryStockLot lot = lotRepository.findById(lotId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.STOCK_LOT,
                        "Stock lot not found: " + lotId));
        if (!lot.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.STOCK_LOT, "Lot not found");
        }
        return lot;
    }
}
