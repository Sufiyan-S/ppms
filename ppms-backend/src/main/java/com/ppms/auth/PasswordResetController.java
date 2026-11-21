package com.ppms.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class PasswordResetController {

    private final PasswordResetService passwordResetService;
    private final LoginRateLimiterService rateLimiterService;
    private final ClientIpResolver clientIpResolver;

    /** Always answers 200 with the same message, so it never reveals whether a phone number is registered. */
    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, String>> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request,
            HttpServletRequest httpRequest) {

        if (rateLimiterService.isResetEmailAllowed(request.getPhoneNumber(), clientIpResolver.resolve(httpRequest))) {
            passwordResetService.sendResetLink(request.getPhoneNumber());
        }
        return ResponseEntity.ok(Map.of("message",
                "If this phone number is registered and has an email on file, a reset link has been sent."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, String>> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request) {
        passwordResetService.resetPassword(request.getToken(), request.getNewPassword());
        return ResponseEntity.ok(Map.of("message", "Password has been reset successfully. You can now log in."));
    }

    @Data
    public static class ForgotPasswordRequest {
        @NotBlank(message = "Phone number is required")
        private String phoneNumber;
    }

    @Data
    public static class ResetPasswordRequest {
        @NotBlank(message = "Token is required")
        private String token;

        @NotBlank(message = "New password is required")
        @Pattern(regexp = PasswordPolicy.REGEX, message = PasswordPolicy.MESSAGE)
        private String newPassword;
    }
}
