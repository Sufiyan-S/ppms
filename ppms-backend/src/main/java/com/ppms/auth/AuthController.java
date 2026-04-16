package com.ppms.auth;

import com.ppms.user.User;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
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

    private static final String COOKIE_NAME = "ppms_jwt";
    private static final String PASSWORD_POLICY_REGEX =
            "^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[^A-Za-z\\d]).{8,}$";
    private static final String PASSWORD_POLICY_MESSAGE =
            "Password must be at least 8 characters and include 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 symbol.";

    private final AuthService authService;
    private final JwtService jwtService;
    private final TokenRevocationService tokenRevocationService;

    @Value("${ppms.security.trusted-proxy-ips:127.0.0.1,::1}")
    private String trustedProxyIpsRaw;

    @Value("${ppms.cookie.secure:false}")
    private boolean cookieSecure;

    @Value("${JWT_EXPIRY_MS:86400000}")
    private long jwtExpiryMs;

    /**
     * POST /api/auth/login
     * Authenticates credentials. The JWT is returned as an httpOnly cookie, NOT in the
     * response body — this prevents JavaScript from reading the token, eliminating the
     * XSS token-theft vector. The response body carries only the user profile fields.
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        String ipAddress = extractClientIp(httpRequest);
        LoginResult result = authService.login(request, ipAddress);
        setJwtCookie(httpResponse, result.token());
        return ResponseEntity.ok(result.loginResponse());
    }

    /**
     * POST /api/auth/logout
     * Revokes the JWT and clears the httpOnly cookie.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse,
            @AuthenticationPrincipal User currentUser) {
        String jwt = extractJwtFromCookie(httpRequest);
        if (jwt != null) {
            tokenRevocationService.revoke(jwt, currentUser.getId(), jwtService.extractExpiration(jwt));
        }
        clearJwtCookie(httpResponse);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/change-password")
    public ResponseEntity<Map<String, String>> changePassword(
            @Valid @RequestBody ChangePasswordRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse,
            @AuthenticationPrincipal User currentUser) {

        authService.changePassword(currentUser, request.getCurrentPassword(), request.getNewPassword());

        String jwt = extractJwtFromCookie(httpRequest);
        if (jwt != null) {
            tokenRevocationService.revoke(jwt, currentUser.getId(), jwtService.extractExpiration(jwt));
        }
        clearJwtCookie(httpResponse);
        return ResponseEntity.ok(Map.of("message", "Password updated successfully. Please sign in again."));
    }

    // ── Cookie helpers ────────────────────────────────────────────────────────

    private void setJwtCookie(HttpServletResponse response, String token) {
        // Use Set-Cookie header directly to set SameSite=Strict, which Jakarta Cookie API does not support.
        // SameSite=Strict prevents the cookie from being sent on cross-site requests (CSRF protection).
        response.setHeader("Set-Cookie",
                String.format("%s=%s; HttpOnly; %sPath=/api; Max-Age=%d; SameSite=Strict",
                        COOKIE_NAME, token,
                        cookieSecure ? "Secure; " : "",
                        (int) (jwtExpiryMs / 1000)));
    }

    private void clearJwtCookie(HttpServletResponse response) {
        response.setHeader("Set-Cookie",
                String.format("%s=; HttpOnly; %sPath=/api; Max-Age=0; SameSite=Strict",
                        COOKIE_NAME,
                        cookieSecure ? "Secure; " : ""));
    }

    private String extractJwtFromCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        for (Cookie cookie : request.getCookies()) {
            if (COOKIE_NAME.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    // ── IP extraction ─────────────────────────────────────────────────────────

    private String extractClientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        Set<String> trustedIps = Arrays.stream(trustedProxyIpsRaw.split(","))
                .map(String::trim)
                .collect(Collectors.toSet());

        if (trustedIps.contains(remoteAddr)) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
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
