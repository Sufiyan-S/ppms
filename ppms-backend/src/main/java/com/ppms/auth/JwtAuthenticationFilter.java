package com.ppms.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Runs once per request. Extracts the JWT from the Authorization header,
 * validates it, and sets the authenticated user in the Spring Security context.
 *
 * Validation steps (in order):
 *   1. JWT signature and expiry (JwtService.isTokenValid)
 *   2. Token not in blacklist (revoked via logout or forced sign-out)
 *   3. User account is still ACTIVE (user not deactivated after token was issued)
 */
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserDetailsService userDetailsService;
    private final TokenRevocationService tokenRevocationService;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        final String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        final String jwt = authHeader.substring(7);
        final String phoneNumber;
        try {
            phoneNumber = jwtService.extractUsername(jwt);
        } catch (JwtException e) {
            // Token is expired, malformed, or has an invalid signature.
            // Return 401 immediately so the frontend can redirect to login.
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"message\":\"Token expired or invalid. Please log in again.\"}");
            return;
        }

        if (phoneNumber != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            UserDetails userDetails;
            try {
                userDetails = userDetailsService.loadUserByUsername(phoneNumber);
            } catch (UsernameNotFoundException e) {
                // Token references a user that no longer exists (e.g. DB wiped, user deleted).
                // Treat as unauthenticated — Spring Security will enforce access rules downstream.
                filterChain.doFilter(request, response);
                return;
            }

            // Step 1: signature + expiry
            if (jwtService.isTokenValid(jwt, userDetails)
                    // Step 2: not explicitly revoked (logout / forced sign-out)
                    && !tokenRevocationService.isRevoked(jwt)
                    // Step 3: account still active (user may have been deactivated after login)
                    && userDetails.isEnabled()
                    && userDetails.isAccountNonLocked()) {

                UsernamePasswordAuthenticationToken authToken =
                        new UsernamePasswordAuthenticationToken(
                                userDetails, null, userDetails.getAuthorities());
                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authToken);
            }
        }

        filterChain.doFilter(request, response);
    }
}
