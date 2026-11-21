package com.ppms.auth;

import com.ppms.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final JwtService jwtService;
    private final TokenRevocationService tokenRevocationService;
    private final JwtCookieSupport jwtCookieSupport;
    private final ClientIpResolver clientIpResolver;

    /**
     * POST /api/auth/login
     * The JWT is returned only as an httpOnly cookie, never in the body, so JavaScript cannot read it.
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        LoginResult result = authService.login(request, clientIpResolver.resolve(httpRequest));
        jwtCookieSupport.writeToken(httpResponse, result.token());
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
        revokeCurrentToken(httpRequest, currentUser);
        jwtCookieSupport.clearToken(httpResponse);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/change-password")
    public ResponseEntity<Map<String, String>> changePassword(
            @Valid @RequestBody ChangePasswordRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse,
            @AuthenticationPrincipal User currentUser) {

        authService.changePassword(currentUser, request.getCurrentPassword(), request.getNewPassword());

        revokeCurrentToken(httpRequest, currentUser);
        jwtCookieSupport.clearToken(httpResponse);
        return ResponseEntity.ok(Map.of("message", "Password updated successfully. Please sign in again."));
    }

    private void revokeCurrentToken(HttpServletRequest httpRequest, User currentUser) {
        String jwt = jwtCookieSupport.readToken(httpRequest);
        if (jwt != null) {
            tokenRevocationService.revoke(jwt, currentUser.getId(), jwtService.extractExpiration(jwt));
        }
    }

    @Data
    public static class ChangePasswordRequest {
        @NotBlank(message = "Current password is required")
        @Size(max = PasswordPolicy.MAX_LENGTH, message = "Password must be at most 72 characters")
        private String currentPassword;

        @NotBlank(message = "New password is required")
        @Pattern(regexp = PasswordPolicy.REGEX, message = PasswordPolicy.MESSAGE)
        private String newPassword;
    }
}
