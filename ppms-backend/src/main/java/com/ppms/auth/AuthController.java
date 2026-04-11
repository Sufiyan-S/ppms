package com.ppms.auth;

import com.ppms.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final String PASSWORD_POLICY_REGEX =
            "^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[^A-Za-z\\d]).{8,}$";
    private static final String PASSWORD_POLICY_MESSAGE =
            "Password must be at least 8 characters and include 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 symbol.";

    private final AuthService authService;
    private final JwtService jwtService;
    private final TokenRevocationService tokenRevocationService;

    /**
     * Comma-separated list of proxy IPs that are allowed to set X-Forwarded-For.
     * Defaults to loopback addresses for local dev. Override with TRUSTED_PROXY_IPS in prod.
     */
    @Value("${ppms.security.trusted-proxy-ips:127.0.0.1,::1}")
    private String trustedProxyIpsRaw;

    /**
     * POST /api/auth/login
     * Authenticates user credentials and returns a signed JWT.
     * Rate-limited: 5 failed attempts per 15-minute window per phone number.
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest) {
        String ipAddress = extractClientIp(httpRequest);
        return ResponseEntity.ok(authService.login(request, ipAddress));
    }

    /**
     * POST /api/auth/logout
     * Revokes the caller's current JWT. The token is added to the blacklist and will
     * be rejected on all subsequent requests, even if it has not expired yet.
     * This endpoint requires an authenticated (valid) token — you cannot log out with
     * an already-expired or already-revoked token.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @RequestHeader("Authorization") String authHeader,
            @AuthenticationPrincipal User currentUser) {

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String jwt = authHeader.substring(7);
            tokenRevocationService.revoke(jwt, currentUser.getId(), jwtService.extractExpiration(jwt));
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/change-password")
    public ResponseEntity<Map<String, String>> changePassword(
            @Valid @RequestBody ChangePasswordRequest request,
            @RequestHeader("Authorization") String authHeader,
            @AuthenticationPrincipal User currentUser) {

        authService.changePassword(currentUser, request.getCurrentPassword(), request.getNewPassword());

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String jwt = authHeader.substring(7);
            tokenRevocationService.revoke(jwt, currentUser.getId(), jwtService.extractExpiration(jwt));
        }

        return ResponseEntity.ok(Map.of("message", "Password updated successfully. Please sign in again."));
    }

    /**
     * Extracts the real client IP address from the request.
     *
     * X-Forwarded-For is only trusted when the direct connection comes from a
     * configured trusted proxy IP (e.g. nginx, AWS ELB). Trusting this header from
     * arbitrary IPs would allow an attacker to spoof their IP and bypass rate limiting
     * by submitting a fake X-Forwarded-For header.
     *
     * In production, set TRUSTED_PROXY_IPS to the IP(s) of your load balancer(s).
     */
    private String extractClientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        Set<String> trustedIps = Arrays.stream(trustedProxyIpsRaw.split(","))
                .map(String::trim)
                .collect(Collectors.toSet());

        if (trustedIps.contains(remoteAddr)) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
                // Take the first IP in the chain — that is the original client IP
                return forwarded.split(",")[0].trim();
            }
        }
        return remoteAddr;
    }

    @Data
    public static class ChangePasswordRequest {
        @NotBlank(message = "Current password is required")
        private String currentPassword;

        @NotBlank(message = "New password is required")
        @Pattern(regexp = PASSWORD_POLICY_REGEX, message = PASSWORD_POLICY_MESSAGE)
        private String newPassword;
    }
}
