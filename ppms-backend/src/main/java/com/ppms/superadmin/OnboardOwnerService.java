package com.ppms.superadmin;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

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

    @Transactional
    public OnboardOwnerResponse onboard(OnboardOwnerRequest request) {
        if (userRepository.existsByPhoneNumber(request.getPhoneNumber())) {
            throw new BusinessException(
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
                .dateOfJoining(LocalDate.now())
                .build();

        owner = userRepository.save(owner);
        log.info("Created OWNER account: employeeId={}, ownerId={}", employeeId, owner.getId());

        // Step 2: create the pump and link it to this owner
        PumpLocation pump = PumpLocation.builder()
                .ownerId(owner.getId())
                .name(request.getPumpName())
                .address(request.getPumpAddress())
                .maxNozzleCount(request.getMaxNozzleCount())
                .build();

        pump = pumpLocationRepository.save(pump);
        log.info("Created pump: pumpId={}, name={}, ownerId={}", pump.getId(), pump.getName(), owner.getId());

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
    public OwnerSummaryResponse addPump(Long ownerId, AddPumpRequest request) {
        User owner = userRepository.findById(ownerId)
                .orElseThrow(() -> new BusinessException("Owner not found: " + ownerId));

        if (owner.getRole() != UserRole.OWNER) {
            throw new BusinessException("User is not an owner");
        }

        PumpLocation pump = PumpLocation.builder()
                .ownerId(owner.getId())
                .name(request.getPumpName())
                .address(request.getPumpAddress())
                .maxNozzleCount(request.getMaxNozzleCount())
                .build();

        pump = pumpLocationRepository.save(pump);
        log.info("Added pump: pumpId={}, name={}, ownerId={}", pump.getId(), pump.getName(), owner.getId());
        return ownerSummaryAssembler.buildOwnerSummary(owner);
    }

    /**
     * Updates a pump's name, address, and enabled status.
     * Only SuperAdmin may call this. Returns the updated owner summary so the UI refreshes.
     */
    @Transactional
    public OwnerSummaryResponse updatePump(Long pumpId, UpdatePumpRequest request) {
        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found: " + pumpId));

        pump.setName(request.getPumpName());
        pump.setAddress(request.getPumpAddress());
        pump.setEnabled(request.getEnabled());
        pumpLocationRepository.save(pump);

        log.info("Pump {} updated: name='{}', address='{}', enabled={}",
                pumpId, pump.getName(), pump.getAddress(), pump.isEnabled());

        User owner = userRepository.findById(pump.getOwnerId())
                .orElseThrow(() -> new ResourceNotFoundException("Owner not found for pump: " + pumpId));
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
