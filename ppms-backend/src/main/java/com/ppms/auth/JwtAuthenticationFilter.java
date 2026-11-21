package com.ppms.auth;

import com.ppms.user.User;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
 * Authenticates requests from the httpOnly JWT cookie.
 *
 * A token is accepted only if its signature and expiry are valid, it is not revoked,
 * its token version matches the user's current one, and the user is still ACTIVE.
 * A rejected token is cleared and the request continues unauthenticated, so public
 * endpoints (login, password reset) still work and Spring Security answers 401 elsewhere.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserDetailsService userDetailsService;
    private final TokenRevocationService tokenRevocationService;
    private final JwtCookieSupport jwtCookieSupport;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        String jwt = jwtCookieSupport.readToken(request);

        if (jwt != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            User user = findUserForValidToken(jwt);
            if (user != null) {
                UsernamePasswordAuthenticationToken authToken =
                        new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authToken);
            } else {
                jwtCookieSupport.clearToken(response);
            }
        }

        filterChain.doFilter(request, response);
    }

    private User findUserForValidToken(String jwt) {
        try {
            UserDetails userDetails = userDetailsService.loadUserByUsername(jwtService.extractUsername(jwt));
            if (userDetails instanceof User user
                    && jwtService.isTokenValid(jwt, user)
                    && !tokenRevocationService.isRevoked(jwt)
                    && user.isEnabled()
                    && user.isAccountNonLocked()) {
                return user;
            }
            return null;
        } catch (JwtException | UsernameNotFoundException e) {
            log.debug("Rejected JWT cookie: {}", e.getClass().getSimpleName());
            return null;
        }
    }
}
