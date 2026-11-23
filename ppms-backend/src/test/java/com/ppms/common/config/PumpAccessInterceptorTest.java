package com.ppms.common.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerMapping;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PumpAccessInterceptorTest {

    private final PumpLocationRepository pumpLocationRepository = mock(PumpLocationRepository.class);
    private final ObjectMapper objectMapper = JsonMapper.builder().findAndAddModules().build();
    private final PumpAccessInterceptor interceptor = new PumpAccessInterceptor(pumpLocationRepository, objectMapper);
    private final HandlerMethod handler = mock(HandlerMethod.class);

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void ownerIsRejectedForPumpTheyDoNotOwnEvenWhenPathIsPercentEncoded() throws Exception {
        signInAs(User.builder().id(1L).role(UserRole.OWNER).build());
        when(pumpLocationRepository.existsByIdAndOwnerId(7L, 1L)).thenReturn(false);
        MockHttpServletRequest request = requestFor("/api/pumps/%37/audit-logs", Map.of("pumpId", "7"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThat(interceptor.preHandle(request, response, handler)).isFalse();
        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    void rejectionBodyHasTheSameShapeAsOtherErrors() throws Exception {
        signInAs(User.builder().id(1L).role(UserRole.OWNER).build());
        when(pumpLocationRepository.existsByIdAndOwnerId(7L, 1L)).thenReturn(false);
        MockHttpServletResponse response = new MockHttpServletResponse();

        interceptor.preHandle(requestFor("/api/pumps/7/shifts", Map.of("pumpId", "7")), response, handler);

        assertThat(response.getContentType()).startsWith("application/json");
        JsonNode body = objectMapper.readTree(response.getContentAsString());
        assertThat(body.get("status").asInt()).isEqualTo(403);
        assertThat(body.get("message").asText()).isEqualTo("You do not have access to pump 7");
        assertThat(body.get("code").asText()).isEqualTo(ErrorCodes.PUMP_ACCESS_DENIED);
        assertThat(body.get("params").get("pumpId").asLong()).isEqualTo(7L);
        assertThat(body.has("timestamp")).isTrue();
    }

    @Test
    void ownerIsAllowedForOwnPump() throws Exception {
        signInAs(User.builder().id(1L).role(UserRole.OWNER).build());
        when(pumpLocationRepository.existsByIdAndOwnerId(7L, 1L)).thenReturn(true);
        when(pumpLocationRepository.existsByIdAndEnabledTrue(7L)).thenReturn(true);

        assertThat(interceptor.preHandle(requestFor("/api/pumps/7/shifts", Map.of("pumpId", "7")),
                new MockHttpServletResponse(), handler)).isTrue();
    }

    @Test
    void ownerAndStaffAreRejectedForASuspendedPumpButSuperAdminIsNot() throws Exception {
        when(pumpLocationRepository.existsByIdAndOwnerId(7L, 1L)).thenReturn(true);
        when(pumpLocationRepository.existsByIdAndEnabledTrue(7L)).thenReturn(false);

        signInAs(User.builder().id(1L).role(UserRole.OWNER).build());
        MockHttpServletResponse ownerResponse = new MockHttpServletResponse();
        assertThat(interceptor.preHandle(requestFor("/api/pumps/7/shifts", Map.of("pumpId", "7")), ownerResponse, handler)).isFalse();
        assertThat(ownerResponse.getStatus()).isEqualTo(403);
        assertThat(ownerResponse.getContentAsString()).contains("Pump is suspended");

        signInAs(User.builder().id(2L).role(UserRole.OPERATOR).assignedPumpId(7L).build());
        assertThat(interceptor.preHandle(requestFor("/api/pumps/7/shifts", Map.of("pumpId", "7")),
                new MockHttpServletResponse(), handler)).isFalse();

        signInAs(User.builder().id(3L).role(UserRole.SUPER_ADMIN).build());
        assertThat(interceptor.preHandle(requestFor("/api/pumps/7/shifts", Map.of("pumpId", "7")),
                new MockHttpServletResponse(), handler)).isTrue();
    }

    @Test
    void staffIsRejectedForPumpTheyAreNotAssignedTo() throws Exception {
        signInAs(User.builder().id(2L).role(UserRole.MANAGER).assignedPumpId(3L).build());
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThat(interceptor.preHandle(requestFor("/api/pumps/7/shifts", Map.of("pumpId", "7")),
                response, handler)).isFalse();
        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    void handlerWithoutPumpIdIsRejectedUnlessItIsThePumpList() throws Exception {
        signInAs(User.builder().id(2L).role(UserRole.MANAGER).assignedPumpId(3L).build());

        assertThat(interceptor.preHandle(requestFor("/api/pumps", Map.of()),
                new MockHttpServletResponse(), handler)).isTrue();
        assertThat(interceptor.preHandle(requestFor("/api/pumps/7/other", Map.of("id", "7")),
                new MockHttpServletResponse(), handler)).isFalse();
    }

    private MockHttpServletRequest requestFor(String uri, Map<String, String> pathVariables) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", uri);
        request.setAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE, pathVariables);
        return request;
    }

    private void signInAs(User user) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
    }
}
