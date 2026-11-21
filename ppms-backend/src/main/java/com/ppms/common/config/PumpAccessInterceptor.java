package com.ppms.common.config;

import com.ppms.pump.PumpLocationRepository;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import java.io.IOException;
import java.util.Map;
import java.util.Set;

/**
 * Enforces pump-level access on every /api/pumps/** and /api/inventory/** request:
 *
 * - SUPER_ADMIN  → always allowed (platform-wide access)
 * - OWNER        → allowed only if they own the pump (pump.ownerId == user.id)
 * - ADMIN / MANAGER / OPERATOR → allowed only if assigned to that pump
 *
 * The pump id is read from the {pumpId} path variable Spring bound for the handler,
 * not from the raw URI, so encoded paths such as /api/pumps/%37/... cannot skip the check.
 * Handlers on these paths without a {pumpId} variable are rejected, except the pump list/create endpoint.
 */
@Component
@RequiredArgsConstructor
public class PumpAccessInterceptor implements HandlerInterceptor {

    private static final String PUMP_ID_VARIABLE = "pumpId";
    private static final Set<String> PATHS_WITHOUT_PUMP_ID = Set.of("/api/pumps", "/api/pumps/");

    private final PumpLocationRepository pumpLocationRepository;

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) throws IOException {

        if (!(handler instanceof HandlerMethod)) {
            return true;
        }

        String pumpIdText = readPumpIdVariable(request);
        if (pumpIdText == null) {
            if (PATHS_WITHOUT_PUMP_ID.contains(request.getRequestURI())) {
                return true;
            }
            return reject(response, HttpServletResponse.SC_FORBIDDEN, "Pump could not be determined for this request");
        }

        long pumpId;
        try {
            pumpId = Long.parseLong(pumpIdText);
        } catch (NumberFormatException e) {
            return reject(response, HttpServletResponse.SC_FORBIDDEN, "Invalid pump id");
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof User user)) {
            return reject(response, HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized");
        }

        if (user.getRole() == UserRole.SUPER_ADMIN) {
            return true;
        }

        if (user.getRole() == UserRole.OWNER) {
            if (!pumpLocationRepository.existsByIdAndOwnerId(pumpId, user.getId())) {
                return reject(response, HttpServletResponse.SC_FORBIDDEN, "You do not have access to pump " + pumpId);
            }
        } else if (!Long.valueOf(pumpId).equals(user.getAssignedPumpId())) {
            return reject(response, HttpServletResponse.SC_FORBIDDEN, "You are not assigned to pump " + pumpId);
        }

        if (!pumpLocationRepository.existsByIdAndEnabledTrue(pumpId)) {
            return reject(response, HttpServletResponse.SC_FORBIDDEN, "Pump is suspended");
        }
        return true;
    }

    private String readPumpIdVariable(HttpServletRequest request) {
        Object variables = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if (variables instanceof Map<?, ?> map && map.get(PUMP_ID_VARIABLE) instanceof String pumpId) {
            return pumpId;
        }
        return null;
    }

    private boolean reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"message\":\"" + message + "\"}");
        return false;
    }
}
