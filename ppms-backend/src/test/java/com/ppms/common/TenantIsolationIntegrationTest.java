package com.ppms.common;

import com.ppms.support.TestDates;
import com.ppms.auth.JwtCookieSupport;
import com.ppms.fuel.FuelType;
import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.DispensaryUnitRepository;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.pump.TankStatus;
import com.ppms.pump.UndergroundTank;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
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

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestContainerConfig.class)
class TenantIsolationIntegrationTest {

    private static final String PASSWORD = "Secret@123";

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private PumpLocationRepository pumpLocationRepository;
    @Autowired private DispensaryUnitRepository duRepository;
    @Autowired private UndergroundTankRepository tankRepository;
    @Autowired private ShiftRepository shiftRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    private User ownerA;
    private PumpLocation pumpA;
    private PumpLocation pumpB;
    private User operatorB;
    private DispensaryUnit duB;
    private UndergroundTank tankB;

    @BeforeEach
    void createTwoPumpsWithSeparateOwners() {
        ownerA = saveUser(UserRole.OWNER, null);
        User ownerB = saveUser(UserRole.OWNER, null);
        pumpA = savePump(ownerA);
        pumpB = savePump(ownerB);
        operatorB = saveUser(UserRole.OPERATOR, pumpB.getId());
        tankB = tankRepository.save(UndergroundTank.builder()
                .pumpId(pumpB.getId())
                .tankIdentifier("T-" + shortId())
                .fuelType(FuelType.PETROL)
                .capacity(new BigDecimal("10000"))
                .currentStock(new BigDecimal("5000"))
                .dipTolerance(new BigDecimal("50"))
                .status(TankStatus.ACTIVE)
                .build());
        duB = duRepository.save(DispensaryUnit.builder()
                .pumpId(pumpB.getId())
                .duNumber(1)
                .name("DU-" + shortId())
                .build());
    }

    @Test
    void ownerCannotDeactivateStaffOfAnotherOwner() throws Exception {
        mockMvc.perform(patch("/api/users/{userId}/status", operatorB.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"INACTIVE\"}")
                        .cookie(loginAs(ownerA)))
                .andExpect(status().isNotFound());

        assertThat(userRepository.findById(operatorB.getId()).orElseThrow().getStatus())
                .isEqualTo(UserStatus.ACTIVE);
    }

    @Test
    void ownerCannotReadOrSetFuelPriceOfAnotherPump() throws Exception {
        Cookie cookie = loginAs(ownerA);

        mockMvc.perform(get("/api/pumps/{pumpId}/fuel-prices/current", pumpB.getId()).cookie(cookie))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/pumps/{pumpId}/fuel-prices", pumpB.getId())
                        .cookie(cookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fuelType\":\"PETROL\",\"pricePerUnit\":1,\"confirmed\":true}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/pumps/{pumpId}/fuel-prices/current", pumpA.getId()).cookie(cookie))
                .andExpect(status().isOk());
    }

    @Test
    void fuelTransactionsForShiftOfAnotherPumpReturn404() throws Exception {
        Shift shiftB = shiftRepository.save(Shift.builder()
                .pumpId(pumpB.getId())
                .duId(duB.getId())
                .operatorId(operatorB.getId())
                .openedByUserId(operatorB.getId())
                .shiftDate(TestDates.today())
                .actualStartTime(TestDates.now())
                .status(ShiftStatus.OPEN)
                .isOverdueFlag(false)
                .build());

        mockMvc.perform(get("/api/pumps/{pumpId}/fuel-transactions", pumpA.getId())
                        .param("shiftId", shiftB.getId().toString())
                        .cookie(loginAs(ownerA)))
                .andExpect(status().isNotFound());
    }

    @Test
    void inventoryLotsReportForTankOfAnotherPumpReturns404() throws Exception {
        mockMvc.perform(get("/api/pumps/{pumpId}/reports/inventory-lots", pumpA.getId())
                        .param("tankId", tankB.getId().toString())
                        .cookie(loginAs(ownerA)))
                .andExpect(status().isNotFound());
    }

    private Cookie loginAs(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phoneNumber\":\"" + user.getPhoneNumber() + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        String setCookie = result.getResponse().getHeader("Set-Cookie");
        return new Cookie(JwtCookieSupport.COOKIE_NAME,
                setCookie.substring(setCookie.indexOf('=') + 1, setCookie.indexOf(';')));
    }

    private User saveUser(UserRole role, Long assignedPumpId) {
        String unique = shortId();
        return userRepository.save(User.builder()
                .employeeId("EMP-" + unique)
                .fullName(role + " " + unique)
                .phoneNumber(randomPhoneNumber())
                .passwordHash(passwordEncoder.encode(PASSWORD))
                .role(role)
                .status(UserStatus.ACTIVE)
                .assignedPumpId(assignedPumpId)
                .dateOfJoining(TestDates.today())
                .build());
    }

    private PumpLocation savePump(User owner) {
        return pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(owner.getId())
                .name("Pump of " + owner.getFullName())
                .address("Test address")
                .maxDuCount(4)
                .build());
    }

    private String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    private String randomPhoneNumber() {
        long number = 6_000_000_000L + (long) (Math.random() * 3_999_999_999L);
        return Long.toString(number);
    }
}
