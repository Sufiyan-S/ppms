package com.ppms.auth;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.time.BusinessClock;
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
    private final PasswordResetTokenRepository resetTokenRepository;
    private final BusinessClock businessClock;

    /**
     * Authenticates the user and returns a signed JWT.
     * Rate limiting: see LoginRateLimiterService (per phone number and per IP).
     *
     * @param request   Login credentials.
     * @param ipAddress The caller's IP address — used for rate-limit tracking and audit. May be null.
     */
    public LoginResult login(LoginRequest request, String ipAddress) {
        rateLimiterService.checkLoginAllowed(request.getPhoneNumber(), ipAddress);

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
                    JwtService.USER_ID_CLAIM, user.getId(),
                    "pumpId", user.getAssignedPumpId() != null ? user.getAssignedPumpId() : "",
                    JwtService.TOKEN_VERSION_CLAIM, user.getTokenVersion()
            ));

            authLoginEventService.onLoginSuccess(user, ipAddress);

            LoginResponse loginResponse = LoginResponse.builder()
                    .userId(user.getId())
                    .fullName(user.getFullName())
                    .phoneNumber(user.getPhoneNumber())
                    .role(user.getRole())
                    .assignedPumpId(user.getAssignedPumpId())
                    .build();

            return new LoginResult(token, loginResponse);

        } catch (AuthenticationException ex) {
            authLoginEventService.onLoginFailure(request.getPhoneNumber(), ipAddress);
            throw new InvalidCredentialsException("Invalid phone number or password");
        }
    }

    @Transactional
    public void changePassword(User currentUser, String currentPassword, String newPassword) {
        User user = userRepository.findByIdForUpdate(currentUser.getId())
                .orElseThrow(() -> new BusinessException("User not found"));

        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new BusinessException("Current password is incorrect.");
        }

        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw new BusinessException("New password must be different from your current password.");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setTokenVersion(user.getTokenVersion() + 1);
        userRepository.save(user);
        resetTokenRepository.markAllUnusedAsUsed(user.getId(), businessClock.now());
    }
}
