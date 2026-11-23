package com.ppms.user;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.auth.LoginRateLimiterService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.planning.ShiftPlanningService;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.shift.ShiftRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final ShiftRepository shiftRepository;
    private final PumpLocationRepository pumpLocationRepository;
    private final AuditService auditService;
    private final BusinessClock businessClock;
    private final LoginRateLimiterService loginRateLimiterService;
    private final ShiftPlanningService shiftPlanningService;

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
            throw new BusinessException(ErrorCodes.USER_PHONE_ALREADY_EXISTS, Map.of(),
                    "A user with phone number " + request.getPhoneNumber() + " already exists");
        }

        assertCanAssignRole(currentUser.getRole(), request.getRole());

        boolean isStaffRole = STAFF_ROLES.contains(request.getRole());
        if (isStaffRole && request.getAssignedPumpId() == null) {
            throw new BusinessException(ErrorCodes.STAFF_ROLE_REQUIRES_PUMP,
                    Map.of("roleCode", request.getRole().name()),
                    request.getRole() + " must be assigned to a pump");
        }
        assertCanCreateStaffForPump(currentUser, request.getAssignedPumpId());

        String employeeId = request.getEmployeeId();
        if (employeeId == null || employeeId.isBlank()) {
            employeeId = isStaffRole
                    ? generateStaffEmployeeId(request.getAssignedPumpId())
                    : "OWN" + System.currentTimeMillis();
        }
        if (userRepository.existsByEmployeeId(employeeId)) {
            throw new BusinessException(ErrorCodes.EMPLOYEE_ID_TAKEN, Map.of("employeeId", employeeId),
                    "Employee ID '" + employeeId + "' is already taken. Please provide a different one.");
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
                .mustChangePassword(true)
                .preferredLanguage(request.getPreferredLanguage() != null
                        ? request.getPreferredLanguage() : UserLanguage.DEFAULT)
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
            throw new BusinessException(ErrorCodes.OWNER_ACCOUNT_NOT_EDITABLE_HERE, Map.of(),
                    "Owner and super-admin accounts cannot be edited through this endpoint");
        }

        boolean signInIdentityChanged = false;

        if (request.getPhoneNumber() != null) {
            String newPhone = request.getPhoneNumber().trim();
            if (!newPhone.equals(user.getPhoneNumber())) {
                if (userRepository.existsByPhoneNumberAndIdNot(newPhone, userId)) {
                    throw new BusinessException(ErrorCodes.PHONE_IN_USE_BY_ANOTHER_USER, Map.of(),
                            "Phone number " + newPhone + " is already in use by another user");
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

        if (request.getPreferredLanguage() != null) {
            user.setPreferredLanguage(request.getPreferredLanguage());
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
            throw new BusinessException(ErrorCodes.FULL_NAME_BLANK, Map.of(), "Full name cannot be blank");
        }

        User user = userRepository.findByIdForUpdate(currentUser.getId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.USER, "User not found"));
        user.setFullName(request.getFullName().trim());
        return StaffResponse.from(userRepository.save(user));
    }

    @Transactional
    public StaffResponse updateMyLanguage(String language, User currentUser) {
        User user = userRepository.findByIdForUpdate(currentUser.getId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.USER, "User not found"));
        user.setPreferredLanguage(language);
        return StaffResponse.from(userRepository.save(user));
    }

    /**
     * The password is temporary: the user must replace it at next sign-in, and every existing session ends
     * because the token version moves on. A SUPER_ADMIN resets owners; an OWNER or ADMIN resets staff they manage.
     */
    @Transactional
    public void resetPassword(Long userId, ResetPasswordRequest request, User currentUser) {
        User user = findUserManagedBy(currentUser, userId);
        assertCanResetPassword(currentUser, user);

        user.setPasswordHash(passwordEncoder.encode(request.getTemporaryPassword()));
        user.setTokenVersion(user.getTokenVersion() + 1);
        user.setMustChangePassword(true);
        userRepository.save(user);
        loginRateLimiterService.clearFailedLogins(user.getPhoneNumber());

        auditService.log(user.getAssignedPumpId(), AuditAction.PASSWORD_RESET,
                "User", user.getId().toString(),
                "Password reset for " + user.getFullName() + " (" + user.getRole() + "); must change it at next sign-in",
                currentUser);
    }

    /**
     * Deactivation is refused while the user has an open shift (Business Rule 45) or a discrepancy that is
     * unresolved or waiting for approval (Business Rule 30).
     */
    @Transactional
    public StaffResponse updateUserStatus(Long userId, UserStatus status, User currentUser) {
        User user = findUserManagedBy(currentUser, userId);

        if (user.getRole() == UserRole.OWNER || user.getRole() == UserRole.SUPER_ADMIN) {
            throw new BusinessException(ErrorCodes.OWNER_ACCOUNT_STATUS_NOT_CHANGEABLE_HERE, Map.of(),
                    "Owner and super-admin account status cannot be changed through this endpoint.");
        }

        if (status == UserStatus.INACTIVE) {
            assertCanDeactivate(user);
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

    private void assertCanDeactivate(User user) {
        assertNoOpenShiftOrDiscrepancy(user, StaffChange.DEACTIVATE);
    }

    private void assertNoOpenShiftOrDiscrepancy(User user, StaffChange change) {
        String action = change.englishAction;
        Map<String, Object> params = Map.of("staffName", user.getFullName());
        if (shiftRepository.hasOpenShift(user.getId())) {
            throw new BusinessException(change.openShiftCode, params,
                    user.getFullName() + " has an open shift. Close the shift before " + action + " (Business Rule 45).");
        }
        if (shiftRepository.hasDiscrepancyPendingApproval(user.getId())) {
            throw new BusinessException(change.pendingApprovalCode, params,
                    user.getFullName() + " has a shift discrepancy waiting for approval. Approve or reject it before " + action + " (Business Rule 30).");
        }
        if (shiftRepository.hasUnresolvedDiscrepancy(user.getId())) {
            throw new BusinessException(change.unresolvedCode, params,
                    user.getFullName() + " has unresolved shift discrepancies. Resolve all pending discrepancies before " + action + " (Business Rule 30).");
        }
    }

    private enum StaffChange {
        DEACTIVATE("deactivating", ErrorCodes.DEACTIVATE_BLOCKED_BY_OPEN_SHIFT,
                ErrorCodes.DEACTIVATE_BLOCKED_BY_DISCREPANCY_PENDING_APPROVAL, ErrorCodes.DEACTIVATE_BLOCKED_BY_UNRESOLVED_DISCREPANCY),
        MOVE_PUMP("moving them to another pump", ErrorCodes.MOVE_STAFF_BLOCKED_BY_OPEN_SHIFT,
                ErrorCodes.MOVE_STAFF_BLOCKED_BY_DISCREPANCY_PENDING_APPROVAL, ErrorCodes.MOVE_STAFF_BLOCKED_BY_UNRESOLVED_DISCREPANCY);

        private final String englishAction;
        private final String openShiftCode;
        private final String pendingApprovalCode;
        private final String unresolvedCode;

        StaffChange(String englishAction, String openShiftCode, String pendingApprovalCode, String unresolvedCode) {
            this.englishAction = englishAction;
            this.openShiftCode = openShiftCode;
            this.pendingApprovalCode = pendingApprovalCode;
            this.unresolvedCode = unresolvedCode;
        }
    }

    /**
     * Moves a staff member between two pumps of the calling owner. Refused while the staff member has an open shift
     * or an unresolved discrepancy at the current pump. Their sessions end, so the next sign-in loads the new pump.
     */
    @Transactional
    public StaffResponse moveToPump(Long userId, Long targetPumpId, User currentUser) {
        User user = findUserManagedBy(currentUser, userId);
        if (!STAFF_ROLES.contains(user.getRole())) {
            throw new BusinessException(ErrorCodes.ONLY_STAFF_CAN_MOVE_PUMP,
                    Map.of(),
                    "Only staff accounts can be moved to another pump.");
        }
        Long fromPumpId = user.getAssignedPumpId();
        if (targetPumpId.equals(fromPumpId)) {
            throw new BusinessException(ErrorCodes.STAFF_ALREADY_AT_PUMP, Map.of("staffName", user.getFullName()),
                    user.getFullName() + " already works at this pump.");
        }
        PumpLocation targetPump = pumpLocationRepository.findById(targetPumpId)
                .filter(pump -> pump.getOwnerId().equals(currentUser.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCodes.MOVE_STAFF_TARGET_PUMP_NOT_OWNED, Map.of(),
                        "You can only move staff to another pump you own."));
        assertNoOpenShiftOrDiscrepancy(user, StaffChange.MOVE_PUMP);

        user.setAssignedPumpId(targetPumpId);
        user.setTokenVersion(user.getTokenVersion() + 1);
        user = userRepository.save(user);
        int removedPlannedShifts = fromPumpId == null ? 0
                : shiftPlanningService.removeStaffFromPumpFrom(user.getId(), fromPumpId, businessClock.today());

        String description = user.getFullName() + " (" + user.getRole() + ") moved from pump " + fromPumpId
                + " to " + targetPump.getName() + " (pump " + targetPumpId + ")"
                + (removedPlannedShifts > 0
                        ? "; " + removedPlannedShifts + " upcoming planned shift(s) at the old pump left unassigned"
                        : "");
        auditService.log(fromPumpId, AuditAction.USER_PUMP_CHANGED, "User", user.getId().toString(), description, currentUser);
        auditService.log(targetPumpId, AuditAction.USER_PUMP_CHANGED, "User", user.getId().toString(), description, currentUser);
        log.info("Staff moved to another pump: userId={}, fromPump={}, toPump={}, by={}",
                user.getId(), fromPumpId, targetPumpId, currentUser.getId());

        return StaffResponse.from(user);
    }

    /** Operators are paid hourly (night and standard rate); other staff a flat daily rate. */
    @Transactional
    public StaffResponse updatePayRates(Long userId, UpdatePayRatesRequest request, User currentUser) {
        User user = findUserManagedBy(currentUser, userId);

        if (user.getRole() == UserRole.OPERATOR) {
            if (request.getShift1HourlyRate() == null || request.getShift1HourlyRate().compareTo(BigDecimal.ZERO) <= 0) {
                throw new BusinessException(ErrorCodes.NIGHT_HOURLY_RATE_NOT_POSITIVE, Map.of(),
                        "Shift 1 (night) hourly rate must be greater than zero");
            }
            if (request.getStandardHourlyRate() == null || request.getStandardHourlyRate().compareTo(BigDecimal.ZERO) <= 0) {
                throw new BusinessException(ErrorCodes.DAY_HOURLY_RATE_NOT_POSITIVE, Map.of(),
                        "Standard (day) hourly rate must be greater than zero");
            }
            user.setShift1HourlyRate(request.getShift1HourlyRate());
            user.setStandardHourlyRate(request.getStandardHourlyRate());
        } else {
            if (request.getDailyRate() == null || request.getDailyRate().compareTo(BigDecimal.ZERO) <= 0) {
                throw new BusinessException(ErrorCodes.DAILY_RATE_NOT_POSITIVE,
                        Map.of(),
                        "Daily rate must be greater than zero");
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
        if (!canAssignRole(callerRole, targetRole)) {
            throw new BusinessException(ErrorCodes.ROLE_NOT_ASSIGNABLE,
                    Map.of("targetRoleCode", targetRole.name(), "callerRoleCode", callerRole.name()),
                    "You do not have permission to create a user with role " + targetRole + ". " +
                    "A " + callerRole + " can only create users with a lower role.");
        }
    }

    private boolean canAssignRole(UserRole callerRole, UserRole targetRole) {
        return switch (callerRole) {
            case SUPER_ADMIN -> true;
            case OWNER -> targetRole != UserRole.SUPER_ADMIN && targetRole != UserRole.OWNER;
            case ADMIN -> targetRole == UserRole.MANAGER
                    || targetRole == UserRole.OPERATOR
                    || targetRole == UserRole.ACCOUNTANT;
            default -> false;
        };
    }

    private void assertCanResetPassword(User currentUser, User target) {
        if (target.getId().equals(currentUser.getId())) {
            throw new BusinessException(ErrorCodes.RESET_OWN_PASSWORD_NOT_ALLOWED, Map.of(),
                    "Use Change Password to change your own password.");
        }
        boolean allowed = currentUser.getRole() == UserRole.SUPER_ADMIN
                ? target.getRole() == UserRole.OWNER
                : canAssignRole(currentUser.getRole(), target.getRole());
        if (!allowed) {
            throw new AccessDeniedException("You cannot reset the password of this account.");
        }
    }

    private void assertCanCreateStaffForPump(User currentUser, Long targetPumpId) {
        if (targetPumpId == null) {
            return;
        }
        if (currentUser.getRole() == UserRole.OWNER
                && !pumpLocationRepository.existsByIdAndOwnerId(targetPumpId, currentUser.getId())) {
            throw new BusinessException(ErrorCodes.PUMP_NOT_OWNED, Map.of("pumpId", targetPumpId),
                    "You do not own pump " + targetPumpId);
        }
        if (currentUser.getRole() == UserRole.ADMIN && !targetPumpId.equals(currentUser.getAssignedPumpId())) {
            throw new BusinessException(ErrorCodes.STAFF_CREATE_ONLY_FOR_OWN_PUMP,
                    Map.of("pumpId", String.valueOf(currentUser.getAssignedPumpId())),
                    "You can only create staff for pump " + currentUser.getAssignedPumpId());
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
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.USER, "User not found"));
        if (!canAccessPump(currentUser, user.getAssignedPumpId())) {
            throw new ResourceNotFoundException(EntityType.USER, "User not found");
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
