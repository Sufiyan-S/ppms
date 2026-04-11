package com.ppms.ancillary;

import com.ppms.common.exception.BusinessException;
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
                .orElseThrow(() -> new ResourceNotFoundException("Ancillary product not found: " + productId));
        if (!product.getPumpId().equals(pumpId)) {
            throw new BusinessException("Product does not belong to this pump.");
        }
        return product;
    }

    public AncillaryStockLot requireLotForPump(Long lotId, Long pumpId) {
        AncillaryStockLot lot = lotRepository.findById(lotId)
                .orElseThrow(() -> new ResourceNotFoundException("Stock lot not found: " + lotId));
        if (!lot.getPumpId().equals(pumpId)) {
            throw new BusinessException("Lot does not belong to this pump.");
        }
        return lot;
    }
}
