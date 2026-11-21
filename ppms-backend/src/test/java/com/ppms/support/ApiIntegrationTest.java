package com.ppms.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ppms.auth.JwtCookieSupport;
import com.ppms.fuel.FuelType;
import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.DispensaryUnitRepository;
import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleRepository;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.pump.PumpShiftDefinition;
import com.ppms.pump.PumpShiftDefinitionRepository;
import com.ppms.pump.TankStatus;
import com.ppms.pump.UndergroundTank;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import jakarta.persistence.EntityManagerFactory;
import jakarta.servlet.http.Cookie;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
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

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Base for HTTP-level integration tests: a real Postgres, the full security chain, and a ready pump
 * (owner, staff, one petrol tank with stock, one DU with a mapped nozzle, a price and an all-day shift).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestContainerConfig.class)
public abstract class ApiIntegrationTest {

    protected static final String PASSWORD = "Secret@123";
    private static final AtomicLong PHONE_SEQUENCE = new AtomicLong(System.nanoTime() % 1_000_000_000L);

    @Autowired protected MockMvc mockMvc;
    @Autowired protected ObjectMapper objectMapper;
    @Autowired protected UserRepository userRepository;
    @Autowired protected PumpLocationRepository pumpLocationRepository;
    @Autowired protected DispensaryUnitRepository duRepository;
    @Autowired protected NozzleRepository nozzleRepository;
    @Autowired protected UndergroundTankRepository tankRepository;
    @Autowired protected PumpShiftDefinitionRepository shiftDefinitionRepository;
    @Autowired protected PasswordEncoder passwordEncoder;
    @Autowired private EntityManagerFactory entityManagerFactory;

    private final Map<Long, Cookie> cookiesByUserId = new HashMap<>();
    private final String clientAddress = TestAddresses.randomPrivateAddress();

    protected record PumpSetup(PumpLocation pump, User owner, User admin, User manager, User operator,
                               User accountant, UndergroundTank tank, DispensaryUnit du, Nozzle nozzle,
                               PumpShiftDefinition allDayShift) {
        public Long pumpId() {
            return pump.getId();
        }
    }

    /** A pump with staff, a petrol tank holding {@code stockLitres} (as a real delivery lot), price ₹100/L. */
    protected PumpSetup createPumpWithStock(String stockLitres) throws Exception {
        User owner = saveUser(UserRole.OWNER, null);
        PumpLocation pump = pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(owner.getId())
                .name("Pump " + shortId())
                .address("Test address")
                .maxDuCount(4)
                .build());
        User admin = saveUser(UserRole.ADMIN, pump.getId());
        User manager = saveUser(UserRole.MANAGER, pump.getId());
        User operator = saveUser(UserRole.OPERATOR, pump.getId());
        User accountant = saveUser(UserRole.ACCOUNTANT, pump.getId());

        UndergroundTank tank = tankRepository.save(UndergroundTank.builder()
                .pumpId(pump.getId())
                .tankIdentifier("T-" + shortId())
                .fuelType(FuelType.PETROL)
                .capacity(new BigDecimal("20000"))
                .currentStock(BigDecimal.ZERO)
                .dipTolerance(new BigDecimal("50"))
                .status(TankStatus.ACTIVE)
                .build());
        DispensaryUnit du = duRepository.save(DispensaryUnit.builder()
                .pumpId(pump.getId())
                .duNumber(1)
                .name("DU-" + shortId())
                .build());
        Nozzle nozzle = nozzleRepository.save(Nozzle.builder()
                .duId(du.getId())
                .nozzleNumber(1)
                .fuelType(FuelType.PETROL)
                .lastReading(new BigDecimal("1000.000"))
                .tankId(tank.getId())
                .build());
        PumpShiftDefinition allDay = shiftDefinitionRepository.save(PumpShiftDefinition.builder()
                .pumpId(pump.getId())
                .name("All day")
                .startTime(LocalTime.MIDNIGHT)
                .endTime(LocalTime.of(23, 59))
                .crossesMidnight(false)
                .isNightShift(false)
                .sortOrder(1)
                .effectiveFrom(TestDates.today().minusYears(1))
                .createdByUserId(owner.getId())
                .build());

        PumpSetup setup = new PumpSetup(pump, owner, admin, manager, operator, accountant, tank, du, nozzle, allDay);
        setFuelPrice(setup, "100.00");
        if (new BigDecimal(stockLitres).signum() > 0) {
            recordDelivery(setup, stockLitres, "90.00", TestDates.today().minusDays(1));
        }
        return setup;
    }

    protected void setFuelPrice(PumpSetup setup, String price) throws Exception {
        perform(post("/api/pumps/{pumpId}/fuel-prices", setup.pumpId()), setup.owner(),
                Map.of("fuelType", "PETROL", "pricePerUnit", new BigDecimal(price), "confirmed", true))
                .andExpect(status().is2xxSuccessful());
    }

    protected JsonNode recordDelivery(PumpSetup setup, String litres, String costPerLitre, LocalDate date) throws Exception {
        return json(perform(post("/api/inventory/{pumpId}/deliveries", setup.pumpId()), setup.owner(),
                Map.of("tankId", setup.tank().getId(),
                        "quantityDelivered", new BigDecimal(litres),
                        "costPricePerUnit", new BigDecimal(costPerLitre),
                        "deliveryDate", date.toString(),
                        "invoiceReference", "INV-" + shortId()))
                .andExpect(status().is2xxSuccessful()));
    }

    protected ResultActions perform(MockHttpServletRequestBuilder request, User user) throws Exception {
        return mockMvc.perform(request.cookie(loginAs(user)));
    }

    protected ResultActions perform(MockHttpServletRequestBuilder request, User user, Object body) throws Exception {
        return mockMvc.perform(request.cookie(loginAs(user))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    /** Number of SQL statements Hibernate prepared while running the request. */
    protected long statementsRunBy(MockHttpServletRequestBuilder request, User user) throws Exception {
        perform(request, user);
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        perform(request, user).andExpect(status().is2xxSuccessful());
        return statistics.getPrepareStatementCount();
    }

    protected JsonNode json(ResultActions result) throws Exception {
        String body = result.andReturn().getResponse().getContentAsString();
        return body.isEmpty() ? objectMapper.createObjectNode() : objectMapper.readTree(body);
    }

    protected Cookie loginAs(User user) throws Exception {
        Cookie cached = cookiesByUserId.get(user.getId());
        if (cached != null) {
            return cached;
        }
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .with(request -> {
                            request.setRemoteAddr(clientAddress);
                            return request;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phoneNumber\":\"" + user.getPhoneNumber() + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().is2xxSuccessful())
                .andReturn();
        String setCookie = result.getResponse().getHeader("Set-Cookie");
        Cookie cookie = new Cookie(JwtCookieSupport.COOKIE_NAME,
                setCookie.substring(setCookie.indexOf('=') + 1, setCookie.indexOf(';')));
        cookiesByUserId.put(user.getId(), cookie);
        return cookie;
    }

    protected User saveUser(UserRole role, Long assignedPumpId) {
        String unique = shortId();
        return userRepository.save(User.builder()
                .employeeId("EMP-" + unique)
                .fullName(role + " " + unique)
                .phoneNumber(nextPhoneNumber())
                .passwordHash(passwordEncoder.encode(PASSWORD))
                .role(role)
                .status(UserStatus.ACTIVE)
                .assignedPumpId(assignedPumpId)
                .dateOfJoining(TestDates.today().minusYears(1))
                .dailyRate(new BigDecimal("800.00"))
                .build());
    }

    protected static String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    private static String nextPhoneNumber() {
        return Long.toString(6_000_000_000L + PHONE_SEQUENCE.incrementAndGet() % 3_999_999_999L);
    }
}
