package com.ppms.auth;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.time.BusinessClock;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Tokens expire after one hour and work once. Only the SHA-256 hash of a token is stored; the raw
 * token exists only in the email. A successful reset signs out every existing session.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private static final int TOKEN_EXPIRY_HOURS = 1;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final JavaMailSender mailSender;
    private final PasswordEncoder passwordEncoder;
    private final BusinessClock businessClock;

    // Not transactional on purpose: the token is committed by save() before the email goes out,
    // so a link is never sent for a token that was rolled back.
    public void sendResetLink(String phoneNumber) {
        userRepository.findByPhoneNumber(phoneNumber).ifPresent(user -> {
            if (user.getEmail() == null || user.getEmail().isBlank()) {
                log.warn("Password reset requested for phone={} but no email is configured for userId={}",
                        PhoneNumberMasking.mask(phoneNumber), user.getId());
                return;
            }

            UUID rawToken = UUID.randomUUID();
            PasswordResetToken resetToken = tokenRepository.save(PasswordResetToken.builder()
                    .userId(user.getId())
                    .tokenHash(TokenHashing.sha256Hex(rawToken.toString()))
                    .expiresAt(businessClock.now().plusHours(TOKEN_EXPIRY_HOURS))
                    .build());
            log.info("Password reset token created for userId={}, tokenId={}", user.getId(), resetToken.getId());

            sendResetEmail(user, rawToken);
        });
    }

    @Transactional
    public void resetPassword(String token, String newPassword) {
        UUID tokenUuid;
        try {
            tokenUuid = UUID.fromString(token);
        } catch (IllegalArgumentException e) {
            throw new BusinessException("Invalid reset token format.");
        }

        PasswordResetToken resetToken = tokenRepository.findByTokenHashForUpdate(TokenHashing.sha256Hex(tokenUuid.toString()))
                .orElseThrow(() -> new BusinessException("Invalid or expired password reset link."));

        if (resetToken.getUsedAt() != null) {
            throw new BusinessException("This password reset link has already been used. Please request a new one.");
        }
        if (businessClock.now().isAfter(resetToken.getExpiresAt())) {
            throw new BusinessException("This password reset link has expired. Please request a new one.");
        }

        User user = userRepository.findByIdForUpdate(resetToken.getUserId())
                .orElseThrow(() -> new BusinessException("User not found for this reset token."));

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setTokenVersion(user.getTokenVersion() + 1);
        userRepository.save(user);

        resetToken.setUsedAt(businessClock.now());
        tokenRepository.save(resetToken);
        tokenRepository.markAllUnusedAsUsed(user.getId(), businessClock.now());

        log.info("Password reset completed for userId={}, tokenId={}", user.getId(), resetToken.getId());
    }

    private void sendResetEmail(User user, UUID token) {
        try {
            SimpleMailMessage mail = new SimpleMailMessage();
            mail.setTo(user.getEmail());
            mail.setSubject("PPMS — Password Reset Request");
            mail.setText(
                    "Hi " + user.getFullName() + ",\n\n" +
                    "You requested a password reset for your PPMS account.\n\n" +
                    "Click the link below to reset your password (valid for " + TOKEN_EXPIRY_HOURS + " hour):\n" +
                    frontendUrl + "/reset-password?token=" + token + "\n\n" +
                    "If you did not request this, you can safely ignore this email.\n\n" +
                    "— PPMS Team"
            );
            mailSender.send(mail);
        } catch (MailException e) {
            // The caller always gets the same generic answer, so a mail failure is only logged.
            log.error("Failed to send password reset email to userId={}", user.getId(), e);
        }
    }
}
