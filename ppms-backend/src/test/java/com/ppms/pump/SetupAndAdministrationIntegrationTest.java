package com.ppms.pump;

import com.ppms.support.TestDates;
import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import com.ppms.fuel.FuelType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SetupAndAdministrationIntegrationTest extends ApiIntegrationTest {

    private PumpSetup setup;

    @BeforeEach
    void createPump() throws Exception {
        setup = createPumpWithStock("1000");
    }

    @Test
    void dispenserListRunsTheSameNumberOfQueriesHoweverManyDispensersThePumpHas() throws Exception {
        long withOneDispenser = statementsRunBy(get("/api/pumps/{pumpId}/dus", setup.pumpId()), setup.owner());
        for (int duNumber = 2; duNumber <= 4; duNumber++) {
            DispensaryUnit du = duRepository.save(DispensaryUnit.builder()
                    .pumpId(setup.pumpId()).duNumber(duNumber).name("DU-" + shortId()).build());
            nozzleRepository.save(Nozzle.builder().duId(du.getId()).nozzleNumber(2).fuelType(FuelType.PETROL)
                    .lastReading(BigDecimal.ZERO).tankId(setup.tank().getId()).build());
            nozzleRepository.save(Nozzle.builder().duId(du.getId()).nozzleNumber(1).fuelType(FuelType.PETROL)
                    .lastReading(BigDecimal.ZERO).tankId(setup.tank().getId()).build());
        }

        long withFourDispensers = statementsRunBy(get("/api/pumps/{pumpId}/dus", setup.pumpId()), setup.owner());
        JsonNode dispensers = json(perform(get("/api/pumps/{pumpId}/dus", setup.pumpId()), setup.owner())
                .andExpect(status().isOk()));

        assertThat(withFourDispensers).isEqualTo(withOneDispenser);
        assertThat(dispensers).hasSize(4);
        assertThat(dispensers.get(3).get("nozzles").get(0).get("nozzleNumber").asInt()).isEqualTo(1);
        assertThat(dispensers.get(3).get("nozzles").get(1).get("nozzleNumber").asInt()).isEqualTo(2);
    }

    @Test
    void priceChangeAboveFifteenPercentNeedsConfirmation() throws Exception {
        perform(post("/api/pumps/{pumpId}/fuel-prices", setup.pumpId()), setup.manager(),
                Map.of("fuelType", "PETROL", "pricePerUnit", new BigDecimal("120.00")))
                .andExpect(status().isConflict());
        perform(post("/api/pumps/{pumpId}/fuel-prices", setup.pumpId()), setup.manager(),
                Map.of("fuelType", "PETROL", "pricePerUnit", new BigDecimal("120.00"), "confirmed", true))
                .andExpect(status().is2xxSuccessful());

        JsonNode current = json(perform(get("/api/pumps/{pumpId}/fuel-prices/current", setup.pumpId()), setup.operator())
                .andExpect(status().isOk()));
        assertThat(current.toString()).contains("120.0");
        JsonNode forToday = json(perform(get("/api/pumps/{pumpId}/fuel-prices/for-date", setup.pumpId())
                .param("date", TestDates.today().toString()), setup.manager()).andExpect(status().isOk()));
        assertThat(forToday.toString()).contains("120.0");
    }

    @Test
    void ownerCreatesStaffForTheirPumpButAdminCannotCreateAnOwner() throws Exception {
        JsonNode created = json(perform(post("/api/users", ""), setup.owner(), newUser(UserRole.OPERATOR))
                .andExpect(status().is2xxSuccessful()));
        assertThat(created.get("role").asText()).isEqualTo("OPERATOR");

        perform(post("/api/users", ""), setup.admin(), newUser(UserRole.OWNER))
                .andExpect(status().is4xxClientError());
        perform(post("/api/users", ""), setup.manager(), newUser(UserRole.OPERATOR))
                .andExpect(status().isForbidden());

        JsonNode staff = json(perform(get("/api/users/staff").param("pumpId", setup.pumpId().toString()), setup.owner())
                .andExpect(status().isOk()));
        assertThat(staff.toString()).contains(created.get("fullName").asText());
    }

    @Test
    void deactivatingStaffLogsThemOutAndBlocksTheirNextLogin() throws Exception {
        User operator = saveUser(UserRole.OPERATOR, setup.pumpId());
        var cookie = loginAs(operator);

        perform(patch("/api/users/{userId}/status", operator.getId()).param("status", "INACTIVE"), setup.owner())
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/pumps/{pumpId}/notifications", setup.pumpId()).cookie(cookie))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/login").contentType("application/json")
                        .content("{\"phoneNumber\":\"" + operator.getPhoneNumber() + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void ownerSetsPayRatesAndUsersCanRenameThemselves() throws Exception {
        perform(patch("/api/users/{userId}/pay-rates", setup.manager().getId()), setup.owner(),
                Map.of("dailyRate", new BigDecimal("950.00")))
                .andExpect(status().isOk());
        assertThat(userRepository.findById(setup.manager().getId()).orElseThrow().getDailyRate())
                .isEqualByComparingTo("950.00");

        perform(patch("/api/users/me/profile"), setup.operator(), Map.of("fullName", "Renamed Operator"))
                .andExpect(status().isOk());
        assertThat(userRepository.findById(setup.operator().getId()).orElseThrow().getFullName())
                .isEqualTo("Renamed Operator");
    }

    @Test
    void tankDuAndNozzleSetupIsOwnerOrAdminOnly() throws Exception {
        JsonNode tank = json(perform(post("/api/pumps/{pumpId}/tanks", setup.pumpId()), setup.admin(),
                Map.of("tankIdentifier", "D-" + shortId(), "fuelType", "DIESEL", "capacity", new BigDecimal("8000")))
                .andExpect(status().is2xxSuccessful()));
        perform(post("/api/pumps/{pumpId}/tanks", setup.pumpId()), setup.manager(),
                Map.of("tankIdentifier", "X-" + shortId(), "fuelType", "DIESEL", "capacity", new BigDecimal("8000")))
                .andExpect(status().isForbidden());

        perform(patch("/api/pumps/{pumpId}/tanks/{tankId}", setup.pumpId(), tank.get("id").asLong()), setup.owner(),
                Map.of("capacity", new BigDecimal("9000")))
                .andExpect(status().isOk());

        JsonNode du = json(perform(post("/api/pumps/{pumpId}/dus", setup.pumpId()), setup.owner(),
                Map.of("name", "Machine " + shortId(), "nozzles",
                        List.of(Map.of("nozzleNumber", 1, "fuelType", "DIESEL", "initialReading", new BigDecimal("50")))))
                .andExpect(status().is2xxSuccessful()));
        long nozzleId = du.get("nozzles").get(0).get("id").asLong();
        perform(patch("/api/pumps/{pumpId}/dus/{duId}/nozzles/{nozzleId}/tank", setup.pumpId(), du.get("id").asLong(), nozzleId),
                setup.owner(), Map.of("tankId", tank.get("id").asLong()))
                .andExpect(status().isOk());

        assertThat(nozzleRepository.findById(nozzleId).orElseThrow().getTankId()).isEqualTo(tank.get("id").asLong());
        JsonNode dus = json(perform(get("/api/pumps/{pumpId}/dus", setup.pumpId()), setup.manager()).andExpect(status().isOk()));
        assertThat(dus.size()).isEqualTo(2);
    }

    @Test
    void newScheduleIsRefusedWhileTheCurrentOneOverlapsAndAcceptedAfterItIsDisabled() throws Exception {
        LocalDate from = TestDates.today().plusDays(10);
        Map<String, Object> morning = shiftDefinition("Morning", "06:00", "13:59", false, 1, from);
        Map<String, Object> evening = shiftDefinition("Evening", "14:00", "21:59", false, 2, from);
        Map<String, Object> night = shiftDefinition("Night", "22:00", "05:59", true, 3, from);

        perform(post("/api/pumps/{pumpId}/shift-definitions", setup.pumpId()), setup.owner(), List.of(morning, evening, night))
                .andExpect(status().isBadRequest());

        perform(patch("/api/pumps/{pumpId}/shift-definitions/disable", setup.pumpId())
                        .param("effectiveFrom", setup.allDayShift().getEffectiveFrom().toString()), setup.owner(),
                Map.of("disableDate", from.minusDays(1).toString()))
                .andExpect(status().is2xxSuccessful());
        perform(post("/api/pumps/{pumpId}/shift-definitions", setup.pumpId()), setup.owner(), List.of(morning, evening, night))
                .andExpect(status().is2xxSuccessful());

        JsonNode forDate = json(perform(get("/api/pumps/{pumpId}/shift-definitions/for-date", setup.pumpId())
                .param("date", from.toString()), setup.manager()).andExpect(status().isOk()));
        assertThat(forDate.toString()).contains("Morning").contains("Evening").contains("Night");
        perform(get("/api/pumps/{pumpId}/shift-definitions/active", setup.pumpId()), setup.manager())
                .andExpect(status().isOk());
    }

    @Test
    void closureForTodayBlocksOpeningShifts() throws Exception {
        JsonNode closure = json(perform(post("/api/pumps/{pumpId}/closures", setup.pumpId()), setup.owner(),
                Map.of("closureDate", TestDates.today().toString(), "reason", "Holiday"))
                .andExpect(status().is2xxSuccessful()));

        perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().isBadRequest());

        perform(delete("/api/pumps/{pumpId}/closures/{id}", setup.pumpId(), closure.get("id").asLong()), setup.owner())
                .andExpect(status().is2xxSuccessful());
        perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful());
    }

    @Test
    void calibrationIsLoggedPerNozzleAndListedForThePump() throws Exception {
        perform(post("/api/pumps/{pumpId}/nozzles/{nozzleId}/calibrations", setup.pumpId(), setup.nozzle().getId()),
                setup.owner(), Map.of("calibrationDate", TestDates.today().toString(), "calibratedBy", "Weights Dept"))
                .andExpect(status().is2xxSuccessful());

        JsonNode calibrations = json(perform(get("/api/pumps/{pumpId}/calibrations", setup.pumpId()), setup.manager())
                .andExpect(status().isOk()));
        assertThat(calibrations.toString()).contains("Weights Dept");
    }

    @Test
    void supplierPaymentIsRecordedAgainstASupplierOfTheSamePump() throws Exception {
        long supplierId = json(perform(post("/api/pumps/{pumpId}/suppliers", setup.pumpId()), setup.owner(),
                Map.of("name", "IOCL " + shortId(), "phone", "9876543210"))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();

        perform(post("/api/pumps/{pumpId}/supplier-payments", setup.pumpId()), setup.owner(),
                Map.of("supplierId", supplierId, "amount", new BigDecimal("50000.00"),
                        "paymentDate", TestDates.today().toString(), "paymentMode", "BANK_TRANSFER"))
                .andExpect(status().is2xxSuccessful());

        JsonNode payments = json(perform(get("/api/pumps/{pumpId}/supplier-payments", setup.pumpId()), setup.owner())
                .andExpect(status().isOk()));
        assertThat(payments.toString()).contains("50000");

        PumpSetup otherPump = createPumpWithStock("0");
        perform(post("/api/pumps/{pumpId}/supplier-payments", otherPump.pumpId()), otherPump.owner(),
                Map.of("supplierId", supplierId, "amount", new BigDecimal("10.00"),
                        "paymentDate", TestDates.today().toString(), "paymentMode", "CASH"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    void tankerDocumentsAndAuditLogAreManagedPerPump() throws Exception {
        perform(post("/api/pumps/{pumpId}/tankers", setup.pumpId()), setup.manager(),
                Map.of("name", "Tanker " + shortId(), "capacityLitres", new BigDecimal("12000"), "tankerType", "OWN"))
                .andExpect(status().is2xxSuccessful());
        perform(post("/api/pumps/{pumpId}/documents", setup.pumpId()), setup.owner(),
                Map.of("name", "PESO licence", "docType", "LICENCE", "expiryDate", TestDates.today().plusDays(10).toString()))
                .andExpect(status().is2xxSuccessful());

        assertThat(json(perform(get("/api/pumps/{pumpId}/tankers", setup.pumpId()), setup.manager())
                .andExpect(status().isOk())).toString()).contains("Tanker");
        assertThat(json(perform(get("/api/pumps/{pumpId}/documents", setup.pumpId()), setup.admin())
                .andExpect(status().isOk())).toString()).contains("PESO licence");
        assertThat(json(perform(get("/api/pumps/{pumpId}/audit-logs", setup.pumpId()), setup.owner())
                .andExpect(status().isOk())).toString()).contains("FUEL_PRICE_UPDATED");
    }

    @Test
    void weeklyPlanIsGeneratedPublishedAndShownToOperators() throws Exception {
        LocalDate weekStart = TestDates.today().plusWeeks(1).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        perform(post("/api/pumps/{pumpId}/staff/{userId}/leaves", setup.pumpId(), setup.operator().getId()), setup.owner(),
                Map.of("leaveDate", weekStart.plusDays(2).toString(), "reason", "Family"))
                .andExpect(status().is2xxSuccessful());

        JsonNode plan = json(perform(post("/api/pumps/{pumpId}/shift-plans/generate", setup.pumpId()), setup.owner(),
                Map.of("weekStart", weekStart.toString(), "operatorsPerDayShift", 1, "operatorsPerNightShift", 1))
                .andExpect(status().is2xxSuccessful()));
        long planId = plan.get("id").asLong();

        perform(post("/api/pumps/{pumpId}/shift-plans/{planId}/publish", setup.pumpId(), planId), setup.owner())
                .andExpect(status().is2xxSuccessful());
        JsonNode entries = json(perform(get("/api/pumps/{pumpId}/shift-plans/{planId}/entries", setup.pumpId(), planId),
                setup.operator()).andExpect(status().isOk()));
        String leaveDay = weekStart.plusDays(2).toString();
        assertThat(entries).isNotEmpty();
        assertThat(entries).noneMatch(entry -> entry.get("operatorUserId").asLong() == setup.operator().getId()
                && leaveDay.equals(entry.get("shiftDate").asText()));
        perform(get("/api/pumps/{pumpId}/shift-plans/my-schedule", setup.pumpId())
                .param("weekStart", weekStart.toString()), setup.operator())
                .andExpect(status().isOk());
        perform(post("/api/pumps/{pumpId}/shift-plans/generate", setup.pumpId()), setup.manager(),
                Map.of("weekStart", weekStart.toString(), "operatorsPerDayShift", 1, "operatorsPerNightShift", 1))
                .andExpect(status().isForbidden());
    }

    @Test
    void superAdminOnboardsAnOwnerWithAPumpAndOthersCannot() throws Exception {
        User superAdmin = saveUser(UserRole.SUPER_ADMIN, null);
        Map<String, Object> onboard = Map.of("fullName", "New Owner", "phoneNumber", "8" + String.format("%09d", System.nanoTime() % 1_000_000_000L),
                "password", "Owner@1234", "pumpName", "Fresh Pump", "pumpAddress", "Highway 1", "maxDuCount", 2);

        perform(post("/api/super-admin/onboard-owner"), setup.owner(), onboard).andExpect(status().isForbidden());
        perform(post("/api/super-admin/onboard-owner"), superAdmin, onboard).andExpect(status().is2xxSuccessful());

        assertThat(json(perform(get("/api/super-admin/owners"), superAdmin).andExpect(status().isOk())).toString())
                .contains("New Owner");
        perform(get("/api/super-admin/analytics"), superAdmin).andExpect(status().isOk());
    }

    @Test
    void onboardingAnOwnerWithAWeakPasswordIsRejected() throws Exception {
        User superAdmin = saveUser(UserRole.SUPER_ADMIN, null);
        Map<String, Object> onboard = Map.of("fullName", "Weak Owner", "phoneNumber", "8" + String.format("%09d", System.nanoTime() % 1_000_000_000L),
                "password", "simple", "pumpName", "Weak Pump", "pumpAddress", "Highway 2", "maxDuCount", 2);

        perform(post("/api/super-admin/onboard-owner"), superAdmin, onboard).andExpect(status().isBadRequest());
    }

    @Test
    void staffListHidesPhoneNumbersAndPayRatesFromManagers() throws Exception {
        JsonNode forOwner = json(perform(get("/api/users/staff").param("pumpId", setup.pumpId().toString()), setup.owner())
                .andExpect(status().isOk()));
        JsonNode forManager = json(perform(get("/api/users/staff").param("pumpId", setup.pumpId().toString()), setup.manager())
                .andExpect(status().isOk()));

        assertThat(forOwner.get(0).get("phoneNumber").isNull()).isFalse();
        for (JsonNode member : forManager) {
            assertThat(member.get("phoneNumber").isNull()).isTrue();
            assertThat(member.get("dailyRate").isNull()).isTrue();
            assertThat(member.get("standardHourlyRate").isNull()).isTrue();
        }
    }

    @Test
    void ownerCanDeleteAnUnusedPumpButNotOneWithShiftsAndNobodyElseCan() throws Exception {
        PumpLocation unused = pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(setup.owner().getId()).name("Unused " + shortId()).address("Nowhere").maxDuCount(1).build());
        perform(delete("/api/pumps/{pumpId}", setup.pumpId()), setup.admin()).andExpect(status().isForbidden());

        perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful());
        perform(delete("/api/pumps/{pumpId}", setup.pumpId()), setup.owner())
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("shifts on record")));

        perform(delete("/api/pumps/{pumpId}", unused.getId()), setup.owner()).andExpect(status().isNoContent());
        assertThat(pumpLocationRepository.findById(unused.getId())).isEmpty();
    }

    @Test
    void changingPasswordInvalidatesTheOldSessionAndTheNewPasswordWorks() throws Exception {
        User manager = saveUser(UserRole.MANAGER, setup.pumpId());
        var oldCookie = loginAs(manager);

        mockMvc.perform(post("/api/auth/change-password").cookie(oldCookie).contentType("application/json")
                        .content("{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"Changed@456\"}"))
                .andExpect(status().is2xxSuccessful());

        mockMvc.perform(get("/api/pumps/{pumpId}/notifications", setup.pumpId()).cookie(oldCookie))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/login").contentType("application/json")
                        .content("{\"phoneNumber\":\"" + manager.getPhoneNumber() + "\",\"password\":\"Changed@456\"}"))
                .andExpect(status().isOk());
    }

    private Map<String, Object> newUser(UserRole role) {
        Map<String, Object> user = new HashMap<>();
        user.put("fullName", role + " " + shortId());
        user.put("phoneNumber", "7" + String.format("%09d", System.nanoTime() % 1_000_000_000L));
        user.put("password", "Staff@1234");
        user.put("role", role.name());
        user.put("gender", "MALE");
        user.put("assignedPumpId", setup.pumpId());
        user.put("dateOfJoining", TestDates.today().toString());
        return user;
    }

    private Map<String, Object> shiftDefinition(String name, String start, String end, boolean night, int order, LocalDate from) {
        Map<String, Object> definition = new HashMap<>();
        definition.put("name", name);
        definition.put("startTime", start);
        definition.put("endTime", end);
        definition.put("isNightShift", night);
        definition.put("sortOrder", order);
        definition.put("effectiveFrom", from.toString());
        return definition;
    }
}
