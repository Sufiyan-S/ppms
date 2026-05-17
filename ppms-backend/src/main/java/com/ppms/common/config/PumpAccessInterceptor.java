package com.ppms.common.config;

import com.ppms.pump.PumpLocationRepository;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Intercepts all /api/pumps/{pumpId}/** and /api/inventory/{pumpId}/** requests
 * and enforces pump-level access control:
 *
 * - SUPER_ADMIN  → always allowed (platform-wide access)
 * - OWNER        → allowed only if they own the pump (pump.ownerId == user.id)
 * - ADMIN / MANAGER / OPERATOR → allowed only if assigned to that pump
 *
 * This interceptor runs AFTER JWT authentication, so SecurityContextHolder
 * already contains the authenticated User.
 */
@Component
@RequiredArgsConstructor
public class PumpAccessInterceptor implements HandlerInterceptor {

    // Matches /api/pumps/{id}/... and /api/inventory/{id}/...
    private static final Pattern PUMP_ID_PATTERN =
            Pattern.compile("^/api/(?:pumps|inventory)/([0-9]+)(?:/.*)?$");

    private final PumpLocationRepository pumpLocationRepository;

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) throws Exception {

        String path = request.getRequestURI();
        Matcher matcher = PUMP_ID_PATTERN.matcher(path);
        if (!matcher.matches()) {
            // URL does not contain a pump ID — nothing to guard here
            return true;
        }

        long pumpId = Long.parseLong(matcher.group(1));

        Object principal = SecurityContextHolder.getContext()
                .getAuthentication()
                .getPrincipal();

        // Guard: only authenticated User instances are expected here
        if (!(principal instanceof User user)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"message\":\"Unauthorized\"}");
            return false;
        }

        // SUPER_ADMIN bypasses all pump-level access guards
        if (user.getRole() == UserRole.SUPER_ADMIN) {
            return true;
        }

        // OWNER: verify they own the pump
        if (user.getRole() == UserRole.OWNER) {
            if (!pumpLocationRepository.existsByIdAndOwnerId(pumpId, user.getId())) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json");
                response.getWriter().write("{\"message\":\"You do not have access to pump " + pumpId + "\"}");
                return false;
            }
            return true;
        }

        // ADMIN / MANAGER / OPERATOR: must be assigned to this exact pump
        if (!Long.valueOf(pumpId).equals(user.getAssignedPumpId())) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.getWriter().write("{\"message\":\"You are not assigned to pump " + pumpId + "\"}");
            return false;
        }

        return true;
    }
}
