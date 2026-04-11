package com.ppms.auth;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final LoginRateLimiterService rateLimiterService;
    private final AuthLoginEventService authLoginEventService;
    private final PasswordEncoder passwordEncoder;
    private final UserRepository userRepository;

    /**
     * Authenticates the user and returns a signed JWT.
     * Rate limiting: blocks if >= 5 failures in the last 15 minutes for this phone number.
     *
     * @param request   Login credentials.
     * @param ipAddress The caller's IP address — used for rate-limit tracking and audit. May be null.
     */
    public LoginResponse login(LoginRequest request, String ipAddress) {
        // Check rate limit BEFORE authenticating — avoids burning bcrypt CPU on blocked callers
        if (rateLimiterService.isBlocked(request.getPhoneNumber())) {
            throw new BusinessException(
                    "Too many failed login attempts. Please wait 15 minutes before trying again.");
        }

        try {
            // Spring Security verifies phone + password against the DB
            var auth = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(
                            request.getPhoneNumber(),
                            request.getPassword()
                    )
            );

            User user = (User) auth.getPrincipal();

            // Embed role and pump into the JWT so the frontend can read them without an extra API call
            String token = jwtService.generateToken(user, Map.of(
                    "role", user.getRole().name(),
                    "userId", user.getId(),
                    "pumpId", user.getAssignedPumpId() != null ? user.getAssignedPumpId() : ""
            ));

            authLoginEventService.onLoginSuccess(user, ipAddress);

            return LoginResponse.builder()
                    .token(token)
                    .userId(user.getId())
                    .fullName(user.getFullName())
                    .phoneNumber(user.getPhoneNumber())
                    .role(user.getRole())
                    .assignedPumpId(user.getAssignedPumpId())
                    .build();

        } catch (AuthenticationException ex) {
            authLoginEventService.onLoginFailure(request.getPhoneNumber(), ipAddress);
            throw new InvalidCredentialsException("Invalid phone number or password");
        }
    }

    @Transactional
    public void changePassword(User currentUser, String currentPassword, String newPassword) {
        if (!passwordEncoder.matches(currentPassword, currentUser.getPasswordHash())) {
            throw new BusinessException("Current password is incorrect.");
        }

        if (passwordEncoder.matches(newPassword, currentUser.getPasswordHash())) {
            throw new BusinessException("New password must be different from your current password.");
        }

        currentUser.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(currentUser);
    }
}
