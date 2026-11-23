package com.ppms.user;

import com.ppms.auth.JwtCookieSupport;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestAddresses;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class UserLanguageIntegrationTest extends ApiIntegrationTest {

    private final String clientAddress = TestAddresses.randomPrivateAddress();
    private PumpSetup setup;

    @BeforeEach
    void createPump() throws Exception {
        setup = createPumpWithStock("0");
    }

    @Test
    void newUserSignsInWithEnglish() throws Exception {
        login(setup.operator().getPhoneNumber())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.preferredLanguage").value("en"));
    }

    @Test
    void userChoosesMarathiAndItComesBackOnSignInAndRefresh() throws Exception {
        perform(patch("/api/users/me/language"), setup.operator(), Map.of("language", "mr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.preferredLanguage").value("mr"));

        MvcResult signIn = login(setup.operator().getPhoneNumber())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.preferredLanguage").value("mr"))
                .andReturn();
        mockMvc.perform(post("/api/auth/refresh").cookie(cookie(signIn, JwtCookieSupport.REFRESH_COOKIE_NAME)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.preferredLanguage").value("mr"));
    }

    @Test
    void unsupportedOrMissingLanguageIsRejected() throws Exception {
        perform(patch("/api/users/me/language"), setup.manager(), Map.of("language", "fr"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.language").value(UserLanguage.MESSAGE));
        perform(patch("/api/users/me/language"), setup.manager(), Map.of())
                .andExpect(status().isBadRequest());

        assertThat(userRepository.findById(setup.manager().getId()).orElseThrow().getPreferredLanguage()).isEqualTo("en");
    }

    @Test
    void ownerCreatesStaffWithHindiAndLaterChangesItToEnglish() throws Exception {
        String phone = "7" + String.format("%09d", System.nanoTime() % 1_000_000_000L);
        long userId = json(perform(post("/api/users"), setup.owner(), Map.of("fullName", "Hindi Operator",
                "phoneNumber", phone, "password", "Staff@1234", "role", "OPERATOR", "gender", "MALE",
                "assignedPumpId", setup.pumpId(), "preferredLanguage", "hi"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.preferredLanguage").value("hi"))).get("id").asLong();

        perform(patch("/api/users/{userId}/details", userId), setup.owner(), Map.of("preferredLanguage", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.preferredLanguage").value("en"));
        assertThat(userRepository.findById(userId).orElseThrow().getPreferredLanguage()).isEqualTo("en");
    }

    @Test
    void staffCreatedWithoutALanguageGetsEnglishAndAnUnsupportedOneIsRejected() throws Exception {
        String phone = "7" + String.format("%09d", System.nanoTime() % 1_000_000_000L);
        perform(post("/api/users"), setup.owner(), Map.of("fullName", "Plain Operator", "phoneNumber", phone,
                "password", "Staff@1234", "role", "OPERATOR", "gender", "MALE", "assignedPumpId", setup.pumpId()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.preferredLanguage").value("en"));

        perform(patch("/api/users/{userId}/details", setup.operator().getId()), setup.owner(),
                Map.of("preferredLanguage", "gu"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void userWhoMustChangeTheirPasswordCannotChangeLanguageFirst() throws Exception {
        User operator = setup.operator();
        operator.setMustChangePassword(true);
        userRepository.save(operator);

        perform(patch("/api/users/me/language"), operator, Map.of("language", "hi"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
    }

    private ResultActions login(String phoneNumber) throws Exception {
        return mockMvc.perform(post("/api/auth/login")
                .with(request -> {
                    request.setRemoteAddr(clientAddress);
                    return request;
                })
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("phoneNumber", phoneNumber, "password", PASSWORD))));
    }

    private static Cookie cookie(MvcResult result, String name) {
        String header = result.getResponse().getHeaders("Set-Cookie").stream()
                .filter(value -> value.startsWith(name + "="))
                .findFirst()
                .orElseThrow();
        return new Cookie(name, header.substring(name.length() + 1, header.indexOf(';')));
    }
}
