package com.ppms.auth;

import com.ppms.support.PostgresTestContainerConfig;
import com.ppms.support.TestAddresses;
import com.ppms.support.TestDates;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestContainerConfig.class)
class RefreshTokenIntegrationTest {

    private static final String PASSWORD = "Secret@123";

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    private final String clientAddress = TestAddresses.randomPrivateAddress();

    private User owner;

    @BeforeEach
    void createOwner() {
        owner = saveOwner();
    }

    @Test
    void loginSetsAShortLivedJwtCookieAndAnAuthScopedRefreshCookie() throws Exception {
        MvcResult result = login().andReturn();

        List<String> setCookies = result.getResponse().getHeaders("Set-Cookie");
        String jwtCookie = cookieHeader(setCookies, JwtCookieSupport.COOKIE_NAME);
        String refreshCookie = cookieHeader(setCookies, JwtCookieSupport.REFRESH_COOKIE_NAME);
        assertThat(jwtCookie).contains("HttpOnly", "Path=/api;", "Max-Age=900", "SameSite=Strict");
        assertThat(refreshCookie).contains("HttpOnly", "Path=/api/auth;", "Max-Age=604800", "SameSite=Strict");
        assertThat(cookieValue(refreshCookie)).matches("[A-Za-z0-9_-]{43}");
    }

    @Test
    void refreshRotatesTheTokenAndReusingAnOldOneEndsTheWholeSession() throws Exception {
        Session firstSession = Session.from(login().andReturn());

        MvcResult refreshed = refresh(firstSession.refresh())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(owner.getId()))
                .andReturn();
        Session secondSession = Session.from(refreshed);
        assertThat(secondSession.refresh().getValue()).isNotEqualTo(firstSession.refresh().getValue());
        perform(get("/api/pumps").cookie(secondSession.jwt())).andExpect(status().isOk());

        refresh(firstSession.refresh()).andExpect(status().isUnauthorized());

        refresh(secondSession.refresh()).andExpect(status().isUnauthorized());
        perform(get("/api/pumps").cookie(secondSession.jwt())).andExpect(status().isUnauthorized());
    }

    @Test
    void logoutRevokesTheRefreshTokenAndClearsBothCookies() throws Exception {
        Session session = Session.from(login().andReturn());

        MvcResult logout = perform(post("/api/auth/logout").cookie(session.jwt(), session.refresh()))
                .andExpect(status().isNoContent())
                .andReturn();

        List<String> setCookies = logout.getResponse().getHeaders("Set-Cookie");
        assertThat(cookieHeader(setCookies, JwtCookieSupport.COOKIE_NAME)).contains("Max-Age=0");
        assertThat(cookieHeader(setCookies, JwtCookieSupport.REFRESH_COOKIE_NAME)).contains("Path=/api/auth;", "Max-Age=0");
        refresh(session.refresh()).andExpect(status().isUnauthorized());
    }

    @Test
    void logoutAfterTheJwtExpiredStillRevokesTheRefreshToken() throws Exception {
        Session session = Session.from(login().andReturn());

        perform(post("/api/auth/logout").cookie(session.refresh())).andExpect(status().isNoContent());

        refresh(session.refresh()).andExpect(status().isUnauthorized());
    }

    @Test
    void changingThePasswordEndsTheRefreshToken() throws Exception {
        Session session = Session.from(login().andReturn());

        perform(post("/api/auth/change-password").cookie(session.jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"Changed@789\"}"))
                .andExpect(status().isOk());

        refresh(session.refresh()).andExpect(status().isUnauthorized());
    }

    @Test
    void deactivatedUserCannotRefresh() throws Exception {
        Session session = Session.from(login().andReturn());
        User reloaded = userRepository.findById(owner.getId()).orElseThrow();
        reloaded.setStatus(UserStatus.INACTIVE);
        userRepository.save(reloaded);

        refresh(session.refresh()).andExpect(status().isUnauthorized());
    }

    @Test
    void refusedRefreshesDoNotCountAsFailedLogins() throws Exception {
        Cookie bogus = new Cookie(JwtCookieSupport.REFRESH_COOKIE_NAME, "not-a-refresh-token");
        for (int attempt = 0; attempt <= LoginRateLimiterService.MAX_FAILURES_PER_IP; attempt++) {
            refresh(bogus).andExpect(status().isUnauthorized());
        }
        perform(post("/api/auth/refresh")).andExpect(status().isUnauthorized());

        login();
    }

    private record Session(Cookie jwt, Cookie refresh) {
        static Session from(MvcResult result) {
            List<String> setCookies = result.getResponse().getHeaders("Set-Cookie");
            return new Session(
                    new Cookie(JwtCookieSupport.COOKIE_NAME, cookieValue(cookieHeader(setCookies, JwtCookieSupport.COOKIE_NAME))),
                    new Cookie(JwtCookieSupport.REFRESH_COOKIE_NAME,
                            cookieValue(cookieHeader(setCookies, JwtCookieSupport.REFRESH_COOKIE_NAME))));
        }
    }

    private static String cookieHeader(List<String> setCookies, String name) {
        return setCookies.stream()
                .filter(header -> header.startsWith(name + "="))
                .reduce((first, second) -> second)
                .orElseThrow(() -> new AssertionError("No Set-Cookie for " + name + " in " + setCookies));
    }

    private static String cookieValue(String setCookie) {
        return setCookie.substring(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
    }

    private ResultActions login() throws Exception {
        return perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phoneNumber\":\"" + owner.getPhoneNumber() + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk());
    }

    private ResultActions refresh(Cookie refreshCookie) throws Exception {
        return perform(post("/api/auth/refresh").cookie(refreshCookie));
    }

    private ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request.with(servletRequest -> {
            servletRequest.setRemoteAddr(clientAddress);
            return servletRequest;
        }));
    }

    private User saveOwner() {
        String unique = UUID.randomUUID().toString().substring(0, 8);
        return userRepository.save(User.builder()
                .employeeId("EMP-" + unique)
                .fullName("Owner " + unique)
                .phoneNumber(Long.toString(6_000_000_000L + (long) (Math.random() * 3_999_999_999L)))
                .passwordHash(passwordEncoder.encode(PASSWORD))
                .role(UserRole.OWNER)
                .status(UserStatus.ACTIVE)
                .dateOfJoining(TestDates.today())
                .build());
    }
}
