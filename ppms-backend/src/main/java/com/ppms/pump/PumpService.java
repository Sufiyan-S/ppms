package com.ppms.pump;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.credit.CreditClientRepository;
import com.ppms.inventory.TankerDeliveryRepository;
import com.ppms.invoice.GstFields;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class PumpService {

    private static final String HAS_DATA_MESSAGE =
            "This pump has recorded data and cannot be deleted. Ask the Super Admin to suspend it instead.";

    private final PumpLocationRepository pumpLocationRepository;
    private final DispensaryUnitRepository duRepository;
    private final NozzleRepository nozzleRepository;
    private final UndergroundTankRepository tankRepository;
    private final ShiftRepository shiftRepository;
    private final UserRepository userRepository;
    private final CreditClientRepository creditClientRepository;
    private final TankerDeliveryRepository tankerDeliveryRepository;
    private final AuditService auditService;
    private final DispensaryUnitService dispensaryUnitService;

    /** An owner sees every enabled pump they own; staff see the one pump they are assigned to. */
    @Transactional(readOnly = true)
    public List<PumpResponse> getMyPumps(User currentUser) {
        return findMyPumps(currentUser).stream()
                .map(this::toPumpResponse)
                .toList();
    }

    /** The pumps behind {@link #getMyPumps}, without their dispensers and nozzles. */
    @Transactional(readOnly = true)
    public List<PumpLocation> findMyPumps(User currentUser) {
        if (currentUser.getRole() == UserRole.OWNER) {
            return pumpLocationRepository.findByOwnerIdAndEnabledTrue(currentUser.getId());
        }
        if (currentUser.getAssignedPumpId() != null) {
            return pumpLocationRepository.findById(currentUser.getAssignedPumpId())
                    .filter(PumpLocation::isEnabled)
                    .map(List::of)
                    .orElse(List.of());
        }
        return List.of();
    }

    @Transactional
    public PumpResponse createPump(CreatePumpRequest request, User currentUser) {

        if (pumpLocationRepository.existsByOwnerIdAndName(currentUser.getId(), request.getName())) {
            throw new BusinessException(
                    "A pump named '" + request.getName() + "' already exists. Please use a different name.");
        }

        PumpLocation pump = PumpLocation.builder()
                .ownerId(currentUser.getId())
                .name(request.getName())
                .address(request.getAddress())
                .maxDuCount(request.getMaxDuCount())
                .build();

        pump = pumpLocationRepository.save(pump);

        auditService.log(pump.getId(), AuditAction.PUMP_CREATED,
                "PumpLocation", pump.getId().toString(),
                "Pump created: " + pump.getName() + " (ownerId=" + pump.getOwnerId() + ")",
                currentUser);

        return toPumpResponse(pump);
    }

    /** The limit can never drop below the number of DUs already configured. */
    @Transactional
    public PumpResponse updateMaxDuCount(Long pumpId, int maxDuCount, User currentUser) {

        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found"));

        long currentDuCount = duRepository.countByPumpId(pumpId);
        if (maxDuCount < currentDuCount) {
            throw new BusinessException(
                    "Cannot set max DUs to " + maxDuCount +
                    " — the pump already has " + currentDuCount + " DUs configured. " +
                    "The new limit must be at least " + currentDuCount + ".");
        }

        pump.setMaxDuCount(maxDuCount);
        pumpLocationRepository.save(pump);

        log.info("Max DU count for pump {} updated to {} by user={}", pumpId, maxDuCount, currentUser.getId());

        return toPumpResponse(pump);
    }

    /** A threshold of zero clears it; a missing value is left as it is; an empty GST value clears it. */
    @Transactional
    public PumpResponse updatePumpSettings(Long pumpId, UpdatePumpSettingsRequest request, User currentUser) {

        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found"));

        if (request.discrepancyEscalationThreshold() != null) {
            if (request.discrepancyEscalationThreshold().compareTo(BigDecimal.ZERO) < 0) {
                throw new BusinessException("Discrepancy escalation threshold cannot be negative.");
            }
            pump.setDiscrepancyEscalationThreshold(
                    request.discrepancyEscalationThreshold().compareTo(BigDecimal.ZERO) == 0
                    ? null
                    : request.discrepancyEscalationThreshold().setScale(2, RoundingMode.HALF_UP));
        }

        if (request.expenseApprovalThreshold() != null) {
            if (request.expenseApprovalThreshold().compareTo(BigDecimal.ZERO) < 0) {
                throw new BusinessException("Expense approval threshold cannot be negative.");
            }
            pump.setExpenseApprovalThreshold(
                    request.expenseApprovalThreshold().compareTo(BigDecimal.ZERO) == 0
                    ? null
                    : request.expenseApprovalThreshold().setScale(2, RoundingMode.HALF_UP));
        }

        if (request.gstin() != null) {
            pump.setGstin(GstFields.normaliseGstin(request.gstin()));
        }
        if (request.legalName() != null) {
            pump.setLegalName(GstFields.trimmedOrNull(request.legalName()));
        }
        if (request.stateName() != null) {
            pump.setStateName(GstFields.trimmedOrNull(request.stateName()));
        }
        if (request.invoicePrefix() != null) {
            pump.setInvoicePrefix(GstFields.normaliseInvoicePrefix(request.invoicePrefix()));
        }

        pumpLocationRepository.save(pump);
        log.info("Pump {} settings updated by user={}: escalationThreshold={}, expenseApprovalThreshold={}",
                pumpId, currentUser.getId(),
                pump.getDiscrepancyEscalationThreshold(), pump.getExpenseApprovalThreshold());

        return toPumpResponse(pump);
    }

    /** Only a pump that was set up but never used can be deleted; its equipment is removed with it. */
    @Transactional
    public void deletePump(Long pumpId, User currentUser) {
        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .filter(found -> found.getOwnerId().equals(currentUser.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found"));

        if (shiftRepository.existsByPumpId(pumpId)) {
            throw new BusinessException("This pump has shifts on record and cannot be deleted.");
        }
        if (userRepository.existsByAssignedPumpId(pumpId)) {
            throw new BusinessException("This pump still has staff assigned. Move or remove them first.");
        }
        if (creditClientRepository.existsByPumpId(pumpId) || tankerDeliveryRepository.existsByPumpId(pumpId)) {
            throw new BusinessException(HAS_DATA_MESSAGE);
        }

        for (DispensaryUnit du : duRepository.findByPumpIdOrderByDuNumberAsc(pumpId)) {
            nozzleRepository.deleteAll(nozzleRepository.findByDuIdOrderByNozzleNumberAsc(du.getId()));
            duRepository.delete(du);
        }
        tankRepository.deleteAll(tankRepository.findByPumpId(pumpId));
        pumpLocationRepository.delete(pump);
        try {
            pumpLocationRepository.flush();
        } catch (DataIntegrityViolationException e) {
            log.warn("Pump {} delete refused by remaining references: {}", pumpId, e.getMostSpecificCause().getMessage());
            throw new BusinessException(HAS_DATA_MESSAGE);
        }
        log.info("Pump deleted: pump={}, owner={}", pumpId, currentUser.getId());
    }

    private PumpResponse toPumpResponse(PumpLocation pump) {
        List<DUResponse> activeDUs = dispensaryUnitService.getActiveDUs(pump.getId());

        return PumpResponse.builder()
                .id(pump.getId())
                .name(pump.getName())
                .address(pump.getAddress())
                .maxDuCount(pump.getMaxDuCount())
                .ownerId(pump.getOwnerId())
                .createdAt(pump.getCreatedAt())
                .discrepancyEscalationThreshold(pump.getDiscrepancyEscalationThreshold())
                .expenseApprovalThreshold(pump.getExpenseApprovalThreshold())
                .gstin(pump.getGstin())
                .legalName(pump.getLegalName())
                .stateName(pump.getStateName())
                .invoicePrefix(pump.getInvoicePrefix())
                .dus(activeDUs)
                .build();
    }
}
