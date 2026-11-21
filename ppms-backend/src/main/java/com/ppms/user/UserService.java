package com.ppms.user;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.shift.ShiftRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final ShiftRepository shiftRepository;
    private final PumpLocationRepository pumpLocationRepository;
    private final AuditService auditService;
    private final BusinessClock businessClock;

    private static final Set<UserRole> STAFF_ROLES =
            Set.of(UserRole.OPERATOR, UserRole.MANAGER, UserRole.ADMIN, UserRole.ACCOUNTANT);

    @Transactional(readOnly = true)
    public List<StaffResponse> getOperators(Long pumpId, User currentUser) {
        assertPumpAccess(currentUser, pumpId);
        return userRepository.findByAssignedPumpIdAndRoleAndStatus(pumpId, UserRole.OPERATOR, UserStatus.ACTIVE)
                .stream()
                .map(user -> StaffResponse.visibleTo(currentUser, user))
                .toList();
    }

    /** Phone numbers and pay rates are only included for Owner, Admin and Super Admin. */
    @Transactional(readOnly = true)
    public List<StaffResponse> getStaff(Long pumpId, User currentUser) {
        assertPumpAccess(currentUser, pumpId);
        return userRepository.findByAssignedPumpId(pumpId)
                .stream()
                .filter(u -> u.getRole() != UserRole.OWNER && u.getRole() != UserRole.SUPER_ADMIN)
                .map(user -> StaffResponse.visibleTo(currentUser, user))
                .toList();
    }

    @Transactional
    public StaffResponse createUser(CreateUserRequest request, User currentUser) {
        if (userRepository.existsByPhoneNumber(request.getPhoneNumber())) {
            throw new BusinessException("A user with phone number " + request.getPhoneNumber() + " already exists");
        }

        assertCanAssignRole(currentUser.getRole(), request.getRole());

        boolean isStaffRole = STAFF_ROLES.contains(request.getRole());
        if (isStaffRole && request.getAssignedPumpId() == null) {
            throw new BusinessException(request.getRole() + " must be assigned to a pump");
        }
        assertCanCreateStaffForPump(currentUser, request.getAssignedPumpId());

        String employeeId = request.getEmployeeId();
        if (employeeId == null || employeeId.isBlank()) {
            employeeId = isStaffRole
                    ? generateStaffEmployeeId(request.getAssignedPumpId())
                    : "OWN" + System.currentTimeMillis();
        }
        if (userRepository.existsByEmployeeId(employeeId)) {
            throw new BusinessException("Employee ID '" + employeeId + "' is already taken. Please provide a different one.");
        }

        User user = User.builder()
                .fullName(request.getFullName())
                .phoneNumber(request.getPhoneNumber())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .gender(request.getGender())
                .nightShiftConsent(request.getRole() == UserRole.OPERATOR
                        && request.getGender() == UserGender.FEMALE
                        && Boolean.TRUE.equals(request.getNightShiftConsent()))
                .role(request.getRole())
                .status(UserStatus.ACTIVE)
                .assignedPumpId(request.getAssignedPumpId())
                .address(request.getAddress())
                .employeeId(employeeId)
                .dateOfJoining(request.getDateOfJoining() != null ? request.getDateOfJoining() : businessClock.today())
                .build();

        user = userRepository.save(user);

        auditService.log(user.getAssignedPumpId(), AuditAction.USER_CREATED,
                "User", user.getId().toString(),
                "User created: " + user.getFullName() + " (" + user.getRole() + ") employeeId=" + user.getEmployeeId(),
                currentUser);

        return StaffResponse.from(user);
    }

    /** Phone must stay unique; a caller cannot assign a role at or above their own. */
    @Transactional
    public StaffResponse updateStaffDetails(Long userId, UpdateStaffDetailsRequest request, User currentUser) {
        User user = findUserManagedBy(currentUser, userId);

        if (user.getRole() == UserRole.OWNER || user.getRole() == UserRole.SUPER_ADMIN) {
            throw new BusinessException("Owner and super-admin accounts cannot be edited through this endpoint");
        }

        boolean signInIdentityChanged = false;

        if (request.getPhoneNumber() != null) {
            String newPhone = request.getPhoneNumber().trim();
            if (!newPhone.equals(user.getPhoneNumber())) {
                if (userRepository.existsByPhoneNumberAndIdNot(newPhone, userId)) {
                    throw new BusinessException("Phone number " + newPhone + " is already in use by another user");
                }
                user.setPhoneNumber(newPhone);
                signInIdentityChanged = true;
            }
        }

        if (request.getFullName() != null && !request.getFullName().isBlank()) {
            user.setFullName(request.getFullName().trim());
        }

        if (request.getRole() != null && request.getRole() != user.getRole()) {
            assertCanAssignRole(currentUser.getRole(), request.getRole());
            user.setRole(request.getRole());
            signInIdentityChanged = true;
        }

        if (request.getGender() != null) {
            user.setGender(request.getGender());
        }

        // Only a female operator can hold night-shift consent, judged on the final role and gender.
        if (user.getRole() == UserRole.OPERATOR && user.getGender() == UserGender.FEMALE) {
            user.setNightShiftConsent(Boolean.TRUE.equals(request.getNightShiftConsent()));
        } else {
            user.setNightShiftConsent(false);
        }

        if (signInIdentityChanged) {
            user.setTokenVersion(user.getTokenVersion() + 1);
        }

        user = userRepository.save(user);

        auditService.log(user.getAssignedPumpId(), AuditAction.USER_UPDATED,
                "User", user.getId().toString(),
                "User details updated: " + user.getFullName() + " (" + user.getRole() + ")",
                currentUser);

        return StaffResponse.from(user);
    }

    @Transactional
    public StaffResponse updateMyProfile(UpdateProfileRequest request, User currentUser) {
        if (request.getFullName() == null || request.getFullName().isBlank()) {
            throw new BusinessException("Full name cannot be blank");
        }

        User user = userRepository.findByIdForUpdate(currentUser.getId())
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        user.setFullName(request.getFullName().trim());
        return StaffResponse.from(userRepository.save(user));
    }

    /** Deactivation is refused while the user has unresolved shift discrepancies (Business Rule 30). */
    @Transactional
    public StaffResponse updateUserStatus(Long userId, UserStatus status, User currentUser) {
        User user = findUserManagedBy(currentUser, userId);

        if (user.getRole() == UserRole.OWNER || user.getRole() == UserRole.SUPER_ADMIN) {
            throw new BusinessException("Owner and super-admin account status cannot be changed through this endpoint.");
        }

        if (status == UserStatus.INACTIVE) {
            if (shiftRepository.hasUnresolvedDiscrepancy(userId)) {
                throw new BusinessException(
                        user.getFullName() + " has unresolved shift discrepancies. Resolve all pending discrepancies before deactivating (Business Rule 30).");
            }
        }

        if (status == UserStatus.INACTIVE && user.getStatus() != UserStatus.INACTIVE) {
            user.setTokenVersion(user.getTokenVersion() + 1);
        }
        user.setStatus(status);
        user = userRepository.save(user);

        AuditAction action = status == UserStatus.INACTIVE ? AuditAction.USER_DEACTIVATED : AuditAction.USER_STATUS_CHANGED;
        auditService.log(user.getAssignedPumpId(), action,
                "User", user.getId().toString(),
                "User status changed to " + status + " for " + user.getFullName() + " (" + user.getRole() + ")",
                currentUser);

        return StaffResponse.from(user);
    }

    /** Operators are paid hourly (night and standard rate); other staff a flat daily rate. */
    @Transactional
    public StaffResponse updatePayRates(Long userId, UpdatePayRatesRequest request, User currentUser) {
        User user = findUserManagedBy(currentUser, userId);

        if (user.getRole() == UserRole.OPERATOR) {
            if (request.getShift1HourlyRate() == null || request.getShift1HourlyRate().compareTo(BigDecimal.ZERO) <= 0) {
                throw new BusinessException("Shift 1 (night) hourly rate must be greater than zero");
            }
            if (request.getStandardHourlyRate() == null || request.getStandardHourlyRate().compareTo(BigDecimal.ZERO) <= 0) {
                throw new BusinessException("Standard (day) hourly rate must be greater than zero");
            }
            user.setShift1HourlyRate(request.getShift1HourlyRate());
            user.setStandardHourlyRate(request.getStandardHourlyRate());
        } else {
            if (request.getDailyRate() == null || request.getDailyRate().compareTo(BigDecimal.ZERO) <= 0) {
                throw new BusinessException("Daily rate must be greater than zero");
            }
            user.setDailyRate(request.getDailyRate());
        }
        user = userRepository.save(user);

        auditService.log(user.getAssignedPumpId(), AuditAction.USER_UPDATED,
                "User", user.getId().toString(),
                "Pay rates updated for " + user.getFullName() + " (" + user.getRole() + ")",
                currentUser);

        return StaffResponse.from(user);
    }

    /**
     * Generates a pump-prefixed sequential employee ID: EMP{pumpId}{seq:05d}.
     * Example: pump 1, 3rd employee → EMP100003.
     *
     * Note: count-based sequence has a small race window under concurrent creation.
     * The unique DB constraint on employee_id acts as the final safety net.
     */
    private String generateStaffEmployeeId(Long pumpId) {
        long count = userRepository.countByAssignedPumpId(pumpId);
        return String.format("EMP%d%05d", pumpId, count + 1);
    }

    /**
     * Enforces the role hierarchy — a caller cannot create a user at or above their own privilege level.
     *
     * Permitted assignments by caller role:
     *   SUPER_ADMIN → any role
     *   OWNER       → ADMIN, MANAGER, OPERATOR, ACCOUNTANT
     *   ADMIN       → MANAGER, OPERATOR, ACCOUNTANT
     *
     * This prevents privilege escalation: an ADMIN cannot create OWNER or SUPER_ADMIN accounts.
     */
    private void assertCanAssignRole(UserRole callerRole, UserRole targetRole) {
        boolean allowed = switch (callerRole) {
            case SUPER_ADMIN -> true;
            case OWNER -> targetRole != UserRole.SUPER_ADMIN && targetRole != UserRole.OWNER;
            case ADMIN -> targetRole == UserRole.MANAGER
                    || targetRole == UserRole.OPERATOR
                    || targetRole == UserRole.ACCOUNTANT;
            default -> false;
        };
        if (!allowed) {
            throw new BusinessException(
                    "You do not have permission to create a user with role " + targetRole + ". " +
                    "A " + callerRole + " can only create users with a lower role.");
        }
    }

    private void assertCanCreateStaffForPump(User currentUser, Long targetPumpId) {
        if (targetPumpId == null) {
            return;
        }
        if (currentUser.getRole() == UserRole.OWNER
                && !pumpLocationRepository.existsByIdAndOwnerId(targetPumpId, currentUser.getId())) {
            throw new BusinessException("You do not own pump " + targetPumpId);
        }
        if (currentUser.getRole() == UserRole.ADMIN && !targetPumpId.equals(currentUser.getAssignedPumpId())) {
            throw new BusinessException("You can only create staff for pump " + currentUser.getAssignedPumpId());
        }
    }

    private void assertPumpAccess(User currentUser, Long pumpId) {
        if (!canAccessPump(currentUser, pumpId)) {
            throw new AccessDeniedException("You do not have access to pump " + pumpId);
        }
    }

    private boolean canAccessPump(User currentUser, Long pumpId) {
        if (currentUser.getRole() == UserRole.SUPER_ADMIN) {
            return true;
        }
        if (pumpId == null) {
            return false;
        }
        if (currentUser.getRole() == UserRole.OWNER) {
            return pumpLocationRepository.existsByIdAndOwnerId(pumpId, currentUser.getId());
        }
        return pumpId.equals(currentUser.getAssignedPumpId());
    }

    private User findUserManagedBy(User currentUser, Long userId) {
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        if (!canAccessPump(currentUser, user.getAssignedPumpId())) {
            throw new ResourceNotFoundException("User not found");
        }
        if (currentUser.getRole() == UserRole.ADMIN && isAdminOrAbove(user.getRole())) {
            throw new AccessDeniedException("An admin cannot change another admin, owner or super-admin account.");
        }
        return user;
    }

    private boolean isAdminOrAbove(UserRole role) {
        return role == UserRole.ADMIN || role == UserRole.OWNER || role == UserRole.SUPER_ADMIN;
    }
}
