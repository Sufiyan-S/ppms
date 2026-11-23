package com.ppms.user;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditLogRepository;
import com.ppms.auth.JwtCookieSupport;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestAddresses;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class StaffPasswordResetIntegrationTest extends ApiIntegrationTest {

    private static final String TEMPORARY_PASSWORD = "Temp@4321";
    private static final String NEW_PASSWORD = "Fresh@9876";

    @Autowired private AuditLogRepository auditLogRepository;

    private final String clientAddress = TestAddresses.randomPrivateAddress();
    private PumpSetup setup;

    @BeforeEach
    void createPump() throws Exception {
        setup = createPumpWithStock("0");
    }

    @Test
    void ownerResetsStaffPasswordWhichEndsTheirSessionsAndForcesAChange() throws Exception {
        User operator = saveUser(UserRole.OPERATOR, setup.pumpId());
        MvcResult oldSession = login(operator.getPhoneNumber(), PASSWORD).andExpect(status().isOk()).andReturn();

        resetPassword(setup.owner(), operator).andExpect(status().isNoContent());

        mockMvc.perform(get("/api/pumps/{pumpId}/notifications", setup.pumpId()).cookie(cookie(oldSession, JwtCookieSupport.COOKIE_NAME)))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/refresh").cookie(cookie(oldSession, JwtCookieSupport.REFRESH_COOKIE_NAME)))
                .andExpect(status().isUnauthorized());
        login(operator.getPhoneNumber(), PASSWORD).andExpect(status().isUnauthorized());
        login(operator.getPhoneNumber(), TEMPORARY_PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(true));
        assertThat(auditLogRepository.findAll()).anyMatch(entry -> entry.getAction() == AuditAction.PASSWORD_RESET
                && String.valueOf(operator.getId()).equals(entry.getEntityId())
                && !entry.getDescription().contains(TEMPORARY_PASSWORD));
    }

    @Test
    void flaggedUserIsRefusedEverywhereUntilTheyChangeTheirPassword() throws Exception {
        User operator = saveUser(UserRole.OPERATOR, setup.pumpId());
        resetPassword(setup.owner(), operator).andExpect(status().isNoContent());
        Cookie jwt = cookie(login(operator.getPhoneNumber(), TEMPORARY_PASSWORD).andReturn(), JwtCookieSupport.COOKIE_NAME);

        mockMvc.perform(get("/api/pumps/{pumpId}/shifts/active", setup.pumpId()).cookie(jwt))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
        mockMvc.perform(get("/api/pumps").cookie(jwt))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));

        mockMvc.perform(post("/api/auth/change-password").cookie(jwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("currentPassword", TEMPORARY_PASSWORD, "newPassword", NEW_PASSWORD))))
                .andExpect(status().isOk());

        MvcResult afterChange = login(operator.getPhoneNumber(), NEW_PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(false))
                .andReturn();
        mockMvc.perform(get("/api/pumps/{pumpId}/shifts/active", setup.pumpId())
                        .cookie(cookie(afterChange, JwtCookieSupport.COOKIE_NAME)))
                .andExpect(status().isOk());
        assertThat(userRepository.findById(operator.getId()).orElseThrow().isMustChangePassword()).isFalse();
    }

    @Test
    void resetClearsAnEarlierLoginLockout() throws Exception {
        User manager = saveUser(UserRole.MANAGER, setup.pumpId());
        for (int attempt = 0; attempt < 5; attempt++) {
            login(manager.getPhoneNumber(), "Wrong@0000").andExpect(status().isUnauthorized());
        }
        login(manager.getPhoneNumber(), PASSWORD).andExpect(status().isTooManyRequests());

        resetPassword(setup.owner(), manager).andExpect(status().isNoContent());

        login(manager.getPhoneNumber(), TEMPORARY_PASSWORD).andExpect(status().isOk());
    }

    @Test
    void adminResetsStaffBelowThemButNotAnotherAdminOrTheOwner() throws Exception {
        User admin = saveUser(UserRole.ADMIN, setup.pumpId());

        resetPassword(admin, setup.operator()).andExpect(status().isNoContent());
        resetPassword(admin, setup.accountant()).andExpect(status().isNoContent());
        resetPassword(admin, setup.admin()).andExpect(status().isForbidden());
        resetPassword(admin, setup.owner()).andExpect(status().isNotFound());
    }

    @Test
    void ownerResetsTheirAdminButNotStaffOfAnotherOwnersPump() throws Exception {
        PumpSetup otherPump = createPumpWithStock("0");

        resetPassword(setup.owner(), otherPump.operator()).andExpect(status().isNotFound());
        resetPassword(setup.owner(), setup.admin()).andExpect(status().isNoContent());
    }

    @Test
    void superAdminResetsAnOwnerButNotStaffOrThemselves() throws Exception {
        User superAdmin = saveUser(UserRole.SUPER_ADMIN, null);

        resetPassword(superAdmin, setup.owner()).andExpect(status().isNoContent());
        resetPassword(superAdmin, setup.manager()).andExpect(status().isForbidden());
        resetPassword(superAdmin, superAdmin).andExpect(status().isBadRequest());
        assertThat(userRepository.findById(setup.owner().getId()).orElseThrow().isMustChangePassword()).isTrue();
    }

    @Test
    void managersOperatorsAndAccountantsCannotResetPasswords() throws Exception {
        for (User caller : List.of(setup.manager(), setup.operator(), setup.accountant())) {
            resetPassword(caller, setup.operator()).andExpect(status().isForbidden());
        }
    }

    @Test
    void weakTemporaryPasswordIsRejected() throws Exception {
        perform(post("/api/users/{userId}/reset-password", setup.operator().getId()), setup.owner(),
                Map.of("temporaryPassword", "simple"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void staffCreatedByTheOwnerMustChangeTheirPasswordButSeededUsersNeedNot() throws Exception {
        String phone = "7" + String.format("%09d", System.nanoTime() % 1_000_000_000L);
        perform(post("/api/users"), setup.owner(), Map.of("fullName", "New Operator", "phoneNumber", phone,
                "password", "Staff@1234", "role", "OPERATOR", "gender", "MALE", "assignedPumpId", setup.pumpId()))
                .andExpect(status().isCreated());

        assertThat(userRepository.findByPhoneNumber(phone).orElseThrow().isMustChangePassword()).isTrue();
        assertThat(userRepository.findById(setup.operator().getId()).orElseThrow().isMustChangePassword()).isFalse();
    }

    private ResultActions resetPassword(User caller, User target) throws Exception {
        return perform(post("/api/users/{userId}/reset-password", target.getId()), caller,
                Map.of("temporaryPassword", TEMPORARY_PASSWORD));
    }

    private ResultActions login(String phoneNumber, String password) throws Exception {
        return mockMvc.perform(post("/api/auth/login")
                .with(request -> {
                    request.setRemoteAddr(clientAddress);
                    return request;
                })
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("phoneNumber", phoneNumber, "password", password))));
    }

    private static Cookie cookie(MvcResult result, String name) {
        String header = result.getResponse().getHeaders("Set-Cookie").stream()
                .filter(value -> value.startsWith(name + "="))
                .findFirst()
                .orElseThrow();
        return new Cookie(name, header.substring(name.length() + 1, header.indexOf(';')));
    }
}
