package com.ppms.superadmin;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.time.BusinessClock;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Handles onboarding of a new pump owner.
 *
 * Creates both the OWNER user account and their first pump in a single
 * @Transactional boundary, so if either fails the whole operation rolls back.
 * This ensures we never have an orphaned owner with no pump, or a pump with no owner.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OnboardOwnerService {

    private final UserRepository userRepository;
    private final PumpLocationRepository pumpLocationRepository;
    private final PasswordEncoder passwordEncoder;
    private final OwnerSummaryAssembler ownerSummaryAssembler;
    private final ShiftRepository shiftRepository;
    private final AuditService auditService;
    private final BusinessClock businessClock;

    @Transactional
    public OnboardOwnerResponse onboard(OnboardOwnerRequest request, User superAdmin) {
        if (userRepository.existsByPhoneNumber(request.getPhoneNumber())) {
            throw new BusinessException(ErrorCodes.USER_PHONE_ALREADY_EXISTS, Map.of(),
                    "A user with phone number " + request.getPhoneNumber() + " already exists");
        }

        // Generate a unique employee ID for the owner using timestamp to avoid conflicts
        String employeeId = "OWN" + System.currentTimeMillis();

        // Step 1: create the OWNER user
        User owner = User.builder()
                .employeeId(employeeId)
                .fullName(request.getFullName())
                .phoneNumber(request.getPhoneNumber())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(UserRole.OWNER)
                .status(UserStatus.ACTIVE)
                .assignedPumpId(null)   // OWNER is not assigned to a pump; they own pumps
                .dateOfJoining(businessClock.today())
                .mustChangePassword(true)
                .build();

        owner = userRepository.save(owner);
        log.info("Created OWNER account: employeeId={}, ownerId={}", employeeId, owner.getId());

        // Step 2: create the pump and link it to this owner
        PumpLocation pump = PumpLocation.builder()
                .ownerId(owner.getId())
                .name(request.getPumpName())
                .address(request.getPumpAddress())
                .maxDuCount(request.getMaxDuCount())
                .build();

        pump = pumpLocationRepository.save(pump);
        log.info("Created pump: pumpId={}, name={}, ownerId={}", pump.getId(), pump.getName(), owner.getId());
        auditService.log(pump.getId(), AuditAction.OWNER_ONBOARDED, "User", owner.getId().toString(),
                "Owner " + owner.getFullName() + " onboarded with pump '" + pump.getName() + "'", superAdmin);

        return OnboardOwnerResponse.builder()
                .ownerId(owner.getId())
                .employeeId(owner.getEmployeeId())
                .fullName(owner.getFullName())
                .phoneNumber(owner.getPhoneNumber())
                .pumpId(pump.getId())
                .pumpName(pump.getName())
                .createdAt(owner.getCreatedAt())
                .build();
    }

    /**
     * Adds a new pump to an existing owner.
     * Returns the updated owner summary (with all pumps) so the UI can refresh in one call.
     */
    @Transactional
    public OwnerSummaryResponse addPump(Long ownerId, AddPumpRequest request, User superAdmin) {
        User owner = userRepository.findById(ownerId)
                .orElseThrow(() -> new BusinessException(ErrorCodes.OWNER_ACCOUNT_NOT_FOUND, Map.of("ownerId", ownerId),
                        "Owner not found: " + ownerId));

        if (owner.getRole() != UserRole.OWNER) {
            throw new BusinessException(ErrorCodes.USER_NOT_OWNER, Map.of(), "User is not an owner");
        }

        PumpLocation pump = PumpLocation.builder()
                .ownerId(owner.getId())
                .name(request.getPumpName())
                .address(request.getPumpAddress())
                .maxDuCount(request.getMaxDuCount())
                .build();

        pump = pumpLocationRepository.save(pump);
        log.info("Added pump: pumpId={}, name={}, ownerId={}", pump.getId(), pump.getName(), owner.getId());
        auditService.log(pump.getId(), AuditAction.PUMP_CREATED, "PumpLocation", pump.getId().toString(),
                "Pump '" + pump.getName() + "' added for owner " + owner.getFullName(), superAdmin);
        return ownerSummaryAssembler.buildOwnerSummary(owner);
    }

    /**
     * Updates a pump's name, address, and enabled status.
     * Only SuperAdmin may call this. Returns the updated owner summary so the UI refreshes.
     * A pump with a shift still open cannot be suspended: its staff could no longer close the shift.
     */
    @Transactional
    public OwnerSummaryResponse updatePump(Long pumpId, UpdatePumpRequest request, User superAdmin) {
        PumpLocation pump = pumpLocationRepository.findByIdForUpdate(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PUMP, "Pump not found: " + pumpId));

        boolean suspending = pump.isEnabled() && !request.getEnabled();
        boolean enabling = !pump.isEnabled() && request.getEnabled();
        if (suspending) {
            long openShifts = shiftRepository.findActiveShiftsByPump(pumpId).stream()
                    .filter(shift -> shift.getStatus() == ShiftStatus.OPEN || shift.getStatus() == ShiftStatus.OPEN_OVERDUE)
                    .count();
            if (openShifts > 0) {
                throw new BusinessException(ErrorCodes.PUMP_SUSPEND_BLOCKED_BY_OPEN_SHIFTS,
                        Map.of("pumpName", pump.getName(), "openShiftCount", openShifts),
                        "Pump '" + pump.getName() + "' has " + openShifts
                        + " open shift(s). Ask the owner to close them before suspending the pump.");
            }
        }
        boolean detailsChanged = !request.getPumpName().equals(pump.getName())
                || !Objects.equals(request.getPumpAddress(), pump.getAddress());
        String previousDetails = pump.getName() + ", " + pump.getAddress();

        pump.setName(request.getPumpName());
        pump.setAddress(request.getPumpAddress());
        pump.setEnabled(request.getEnabled());
        pumpLocationRepository.save(pump);

        if (detailsChanged) {
            auditService.log(pumpId, AuditAction.PUMP_UPDATED, "PumpLocation", pumpId.toString(),
                    "Pump details changed from '" + previousDetails + "' to '" + pump.getName() + ", " + pump.getAddress() + "'",
                    superAdmin);
        }
        if (suspending) {
            auditService.log(pumpId, AuditAction.PUMP_SUSPENDED, "PumpLocation", pumpId.toString(),
                    "Pump '" + pump.getName() + "' suspended", superAdmin);
        }
        if (enabling) {
            auditService.log(pumpId, AuditAction.PUMP_ENABLED, "PumpLocation", pumpId.toString(),
                    "Pump '" + pump.getName() + "' enabled again", superAdmin);
        }

        log.info("Pump {} updated: name='{}', address='{}', enabled={}",
                pumpId, pump.getName(), pump.getAddress(), pump.isEnabled());

        User owner = userRepository.findById(pump.getOwnerId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.OWNER,
                        "Owner not found for pump: " + pumpId));
        return ownerSummaryAssembler.buildOwnerSummary(owner);
    }

    /**
     * Returns all OWNER accounts with their associated pumps.
     * Read-only — no transaction needed.
     */
    public List<OwnerSummaryResponse> listOwners() {
        List<User> owners = userRepository.findByRole(UserRole.OWNER);
        return ownerSummaryAssembler.buildOwnerSummaries(owners);
    }
}
