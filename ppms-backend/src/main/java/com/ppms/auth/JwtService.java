package com.ppms.auth;

import com.ppms.user.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Service
public class JwtService {

    public static final String TOKEN_VERSION_CLAIM = "tokenVersion";
    public static final String USER_ID_CLAIM = "userId";

    @Value("${ppms.jwt.secret}")
    private String jwtSecret;

    @Value("${ppms.jwt.expiration-ms}")
    private long jwtExpirationMs;

    /**
     * Fails fast at startup when the secret is missing or shorter than the 256 bits HMAC-SHA256 needs.
     */
    @PostConstruct
    public void validateJwtSecret() {
        if (jwtSecret == null || jwtSecret.isBlank()) {
            throw new IllegalStateException(
                    "JWT_SECRET environment variable is not set. " +
                    "Set it to a random value of at least 32 bytes (e.g. `openssl rand -base64 48`).");
        }
        if (jwtSecret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException(
                    "JWT_SECRET must be at least 256 bits (32 bytes). " +
                    "Set it to a random value (e.g. `openssl rand -base64 48`).");
        }
    }

    public String generateToken(UserDetails userDetails, Map<String, Object> extraClaims) {
        return Jwts.builder()
                .claims(extraClaims)
                .subject(userDetails.getUsername())  // phone number is the username
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + jwtExpirationMs))
                .signWith(getSigningKey())
                .compact();
    }

    public String generateToken(UserDetails userDetails) {
        return generateToken(userDetails, new HashMap<>());
    }

    public boolean isTokenValid(String token, User user) {
        Claims claims = extractAllClaims(token);
        Integer tokenVersion = claims.get(TOKEN_VERSION_CLAIM, Integer.class);
        Long userId = claims.get(USER_ID_CLAIM, Long.class);
        return claims.getSubject().equals(user.getUsername())
                && user.getId().equals(userId)
                && claims.getExpiration().after(new Date())
                && tokenVersion != null
                && tokenVersion == user.getTokenVersion();
    }

    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    /** Returns the expiration Date from the JWT payload. Used by logout to store expiry in the blacklist. */
    public Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }

    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        return claimsResolver.apply(extractAllClaims(token));
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
    }
}
