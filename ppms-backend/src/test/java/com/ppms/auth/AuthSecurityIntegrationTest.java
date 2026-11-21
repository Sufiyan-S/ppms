package com.ppms.auth;

import com.ppms.support.TestAddresses;
import com.ppms.support.TestDates;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.support.PostgresTestContainerConfig;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.ResultActions;

import java.net.URI;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestContainerConfig.class)
class AuthSecurityIntegrationTest {

    private static final String PASSWORD = "Secret@123";

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private PumpLocationRepository pumpLocationRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private PasswordResetTokenRepository resetTokenRepository;

    private final String clientAddress = TestAddresses.randomPrivateAddress();

    private User ownerA;
    private PumpLocation pumpA;
    private PumpLocation pumpB;

    @BeforeEach
    void createTwoOwnersWithOnePumpEach() {
        ownerA = saveOwner();
        User ownerB = saveOwner();
        pumpA = savePump(ownerA);
        pumpB = savePump(ownerB);
    }

    @Test
    void ownerCannotReadAnotherOwnersPump() throws Exception {
        Cookie cookie = loginAs(ownerA);

        perform(get("/api/pumps/{pumpId}/audit-logs", pumpB.getId()).cookie(cookie))
                .andExpect(status().isForbidden());
        perform(get("/api/pumps/{pumpId}/audit-logs", pumpA.getId()).cookie(cookie))
                .andExpect(status().isOk());
    }

    @Test
    void percentEncodedPumpIdCannotSkipTheAccessCheck() throws Exception {
        Cookie cookie = loginAs(ownerA);
        String encodedPumpId = pumpB.getId().toString().chars()
                .mapToObj(digit -> "%3" + (char) digit)
                .collect(Collectors.joining());

        perform(get(URI.create("/api/pumps/" + encodedPumpId + "/audit-logs")).cookie(cookie))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidCookieDoesNotBlockLogin() throws Exception {
        perform(post("/api/auth/login")
                        .cookie(new Cookie(JwtCookieSupport.COOKIE_NAME, "not-a-valid-jwt"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(ownerA.getPhoneNumber(), PASSWORD)))
                .andExpect(status().isOk());
    }

    @Test
    void invalidCookieOnProtectedEndpointReturns401AndClearsCookie() throws Exception {
        MvcResult result = perform(get("/api/pumps")
                        .cookie(new Cookie(JwtCookieSupport.COOKIE_NAME, "not-a-valid-jwt")))
                .andExpect(status().isUnauthorized())
                .andReturn();

        assertThat(result.getResponse().getHeader("Set-Cookie")).contains("Max-Age=0");
    }

    @Test
    void tokenIsRejectedAfterTokenVersionChanges() throws Exception {
        Cookie cookie = loginAs(ownerA);
        perform(get("/api/pumps").cookie(cookie)).andExpect(status().isOk());

        User reloaded = userRepository.findById(ownerA.getId()).orElseThrow();
        reloaded.setTokenVersion(reloaded.getTokenVersion() + 1);
        userRepository.save(reloaded);

        perform(get("/api/pumps").cookie(cookie)).andExpect(status().isUnauthorized());
    }

    @Test
    void tokenDoesNotFollowAPhoneNumberToAnotherUser() throws Exception {
        String originalPhone = ownerA.getPhoneNumber();
        Cookie cookie = loginAs(ownerA);

        User moved = userRepository.findById(ownerA.getId()).orElseThrow();
        moved.setPhoneNumber(randomPhoneNumber());
        userRepository.save(moved);
        User newcomer = saveOwner();
        newcomer.setPhoneNumber(originalPhone);
        userRepository.save(newcomer);

        perform(get("/api/pumps").cookie(cookie)).andExpect(status().isUnauthorized());
    }

    @Test
    void adminCannotChangeAnotherAdminAtTheSamePump() throws Exception {
        User admin = saveStaff(UserRole.ADMIN, pumpA.getId());
        User otherAdmin = saveStaff(UserRole.ADMIN, pumpA.getId());

        perform(patch("/api/users/{userId}/details", otherAdmin.getId())
                        .cookie(loginAs(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"OPERATOR\"}"))
                .andExpect(status().isForbidden());

        assertThat(userRepository.findById(otherAdmin.getId()).orElseThrow().getRole()).isEqualTo(UserRole.ADMIN);
    }

    @Test
    void repeatedResetRequestsForOnePhoneStillGetTheGenericAnswer() throws Exception {
        for (int attempt = 0; attempt <= LoginRateLimiterService.MAX_RESET_REQUESTS_PER_PHONE + 1; attempt++) {
            perform(post("/api/auth/forgot-password")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"phoneNumber\":\"" + ownerA.getPhoneNumber() + "\"}"))
                    .andExpect(status().isOk());
        }
    }

    @Test
    void sixthFailedLoginForSamePhoneReturns429() throws Exception {
        for (int attempt = 0; attempt < LoginRateLimiterService.MAX_FAILURES_PER_PHONE; attempt++) {
            perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(loginBody(ownerA.getPhoneNumber(), "Wrong@123")))
                    .andExpect(status().isUnauthorized());
        }

        perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(ownerA.getPhoneNumber(), PASSWORD)))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void resettingThePasswordEndsSessionsAndCancelsOtherResetLinks() throws Exception {
        Cookie oldSession = loginAs(ownerA);
        UUID usedLink = saveResetToken(ownerA);
        UUID otherLink = saveResetToken(ownerA);

        perform(post("/api/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + usedLink + "\",\"newPassword\":\"Fresh@4567\"}"))
                .andExpect(status().isOk());

        perform(get("/api/pumps").cookie(oldSession)).andExpect(status().isUnauthorized());
        perform(post("/api/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + otherLink + "\",\"newPassword\":\"Other@4567\"}"))
                .andExpect(status().isBadRequest());
        perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(ownerA.getPhoneNumber(), "Fresh@4567")))
                .andExpect(status().isOk());
    }

    @Test
    void changingThePasswordCancelsResetLinksAlreadySent() throws Exception {
        User owner = saveOwner();
        Cookie session = loginAs(owner);
        UUID pendingLink = saveResetToken(owner);

        perform(post("/api/auth/change-password").cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"Changed@789\"}"))
                .andExpect(status().isOk());

        perform(post("/api/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + pendingLink + "\",\"newPassword\":\"Other@4567\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void resetLinkWorksOnlyOnce() throws Exception {
        UUID link = saveResetToken(ownerA);
        String body = "{\"token\":\"" + link + "\",\"newPassword\":\"Fresh@4567\"}";

        perform(post("/api/auth/reset-password").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        perform(post("/api/auth/reset-password").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("already been used")));
    }

    @Test
    void expiredOrMalformedResetLinkIsRefusedAndThePasswordStaysTheSame() throws Exception {
        UUID expiredLink = UUID.randomUUID();
        resetTokenRepository.save(PasswordResetToken.builder()
                .userId(ownerA.getId())
                .tokenHash(TokenHashing.sha256Hex(expiredLink.toString()))
                .expiresAt(TestDates.now().minusMinutes(1))
                .build());

        perform(post("/api/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + expiredLink + "\",\"newPassword\":\"Fresh@4567\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("expired")));
        perform(post("/api/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"not-a-token\",\"newPassword\":\"Fresh@4567\"}"))
                .andExpect(status().isBadRequest());
        perform(post("/api/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + saveResetToken(ownerA) + "\",\"newPassword\":\"weak\"}"))
                .andExpect(status().isBadRequest());

        perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(ownerA.getPhoneNumber(), "Fresh@4567")))
                .andExpect(status().isUnauthorized());
    }

    private UUID saveResetToken(User user) {
        UUID token = UUID.randomUUID();
        resetTokenRepository.save(PasswordResetToken.builder()
                .userId(user.getId())
                .tokenHash(TokenHashing.sha256Hex(token.toString()))
                .expiresAt(TestDates.now().plusHours(1))
                .build());
        return token;
    }

    private Cookie loginAs(User user) throws Exception {
        MvcResult result = perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(user.getPhoneNumber(), PASSWORD)))
                .andExpect(status().isOk())
                .andReturn();
        String setCookie = result.getResponse().getHeader("Set-Cookie");
        String token = setCookie.substring(
                setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
        return new Cookie(JwtCookieSupport.COOKIE_NAME, token);
    }

    private ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request.with(servletRequest -> {
            servletRequest.setRemoteAddr(clientAddress);
            return servletRequest;
        }));
    }

    private String loginBody(String phoneNumber, String password) {
        return "{\"phoneNumber\":\"" + phoneNumber + "\",\"password\":\"" + password + "\"}";
    }

    private User saveOwner() {
        String unique = UUID.randomUUID().toString().substring(0, 8);
        return userRepository.save(User.builder()
                .employeeId("EMP-" + unique)
                .fullName("Owner " + unique)
                .phoneNumber(randomPhoneNumber())
                .passwordHash(passwordEncoder.encode(PASSWORD))
                .role(UserRole.OWNER)
                .status(UserStatus.ACTIVE)
                .dateOfJoining(TestDates.today())
                .build());
    }

    private User saveStaff(UserRole role, Long pumpId) {
        User staff = saveOwner();
        staff.setRole(role);
        staff.setAssignedPumpId(pumpId);
        return userRepository.save(staff);
    }

    private PumpLocation savePump(User owner) {
        return pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(owner.getId())
                .name("Pump of " + owner.getFullName())
                .address("Test address")
                .maxDuCount(4)
                .build());
    }

    private String randomPhoneNumber() {
        long number = 6_000_000_000L + (long) (Math.random() * 3_999_999_999L);
        return Long.toString(number);
    }
}
