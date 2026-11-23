package com.ppms.supplier;

import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class SupplierService {

    private final FuelSupplierRepository supplierRepository;

    @Transactional(readOnly = true)
    public List<FuelSupplier> getActiveSuppliers(Long pumpId) {
        return supplierRepository.findByPumpIdAndActiveTrueOrderByNameAsc(pumpId);
    }

    @Transactional
    public FuelSupplier createSupplier(Long pumpId, UpsertSupplierRequest req) {
        FuelSupplier supplier = FuelSupplier.builder().pumpId(pumpId).build();
        applyDetails(supplier, req);
        return supplierRepository.save(supplier);
    }

    @Transactional
    public FuelSupplier updateSupplier(Long pumpId, Long supplierId, UpsertSupplierRequest req) {
        FuelSupplier supplier = findSupplier(pumpId, supplierId);
        applyDetails(supplier, req);
        return supplierRepository.save(supplier);
    }

    /** Soft delete, so past deliveries keep their supplier. */
    @Transactional
    public void deactivateSupplier(Long pumpId, Long supplierId) {
        FuelSupplier supplier = findSupplier(pumpId, supplierId);
        supplier.setActive(false);
        supplierRepository.save(supplier);
    }

    private FuelSupplier findSupplier(Long pumpId, Long supplierId) {
        return supplierRepository.findByIdAndPumpId(supplierId, pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.SUPPLIER, "Supplier not found"));
    }

    private void applyDetails(FuelSupplier supplier, UpsertSupplierRequest req) {
        supplier.setName(req.getName().trim());
        supplier.setContactName(req.getContactName());
        supplier.setPhone(req.getPhone());
        supplier.setEmail(req.getEmail());
        supplier.setNotes(req.getNotes());
    }
}
