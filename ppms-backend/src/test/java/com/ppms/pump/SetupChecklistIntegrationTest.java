package com.ppms.pump;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.fuel.FuelType;
import com.ppms.fuel.GlobalFuelPrice;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestDates;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SetupChecklistIntegrationTest extends ApiIntegrationTest {

    @Autowired private GlobalFuelPriceRepository fuelPriceRepository;

    private PumpSetup setup;

    @BeforeEach
    void createPump() throws Exception {
        setup = createPumpWithStock("0");
    }

    @Test
    void pumpWithEverythingButGstDetailsHasFiveOfSixRequiredStepsDone() throws Exception {
        JsonNode checklist = checklist(setup.pumpId(), setup.owner());

        assertThat(checklist.get("doneCount").asInt()).isEqualTo(5);
        assertThat(checklist.get("requiredCount").asInt()).isEqualTo(6);
        assertThat(step(checklist, "DISPENSERS").get("done").asBoolean()).isTrue();
        assertThat(step(checklist, "TANKS").get("done").asBoolean()).isTrue();
        assertThat(step(checklist, "FUEL_PRICES").get("done").asBoolean()).isTrue();
        assertThat(step(checklist, "SHIFT_DEFINITIONS").get("done").asBoolean()).isTrue();
        assertThat(step(checklist, "STAFF").get("done").asBoolean()).isTrue();
        assertThat(step(checklist, "GST_DETAILS").get("done").asBoolean()).isFalse();
        assertThat(step(checklist, "CREDIT_CLIENTS").get("done").asBoolean()).isFalse();
        assertThat(step(checklist, "CREDIT_CLIENTS").get("optional").asBoolean()).isTrue();
        assertThat(step(checklist, "GST_DETAILS").get("detailCode").asText()).isEqualTo("SETUP_GST_DETAILS_MISSING");
        assertThat(step(checklist, "GST_DETAILS").get("detailParams").isEmpty()).isTrue();
    }

    @Test
    void gstDetailsAndACreditClientCompleteTheChecklist() throws Exception {
        perform(patch("/api/pumps/{pumpId}/settings", setup.pumpId()), setup.owner(),
                Map.of("gstin", "27AAAPL1234C1ZV", "legalName", "Lakshmi Fuels Pvt Ltd",
                        "stateName", "Maharashtra", "invoicePrefix", "LF"))
                .andExpect(status().isOk());
        perform(post("/api/pumps/{pumpId}/credit-clients", setup.pumpId()), setup.manager(),
                Map.of("name", "Client " + shortId(), "phone", "9" + String.format("%09d", System.nanoTime() % 1_000_000_000L)))
                .andExpect(status().is2xxSuccessful());

        JsonNode checklist = checklist(setup.pumpId(), setup.admin());

        assertThat(checklist.get("doneCount").asInt()).isEqualTo(6);
        assertThat(step(checklist, "GST_DETAILS").get("done").asBoolean()).isTrue();
        assertThat(step(checklist, "CREDIT_CLIENTS").get("done").asBoolean()).isTrue();
    }

    @Test
    void nozzleNotLinkedToATankLeavesTheTankStepOpen() throws Exception {
        nozzleRepository.save(Nozzle.builder()
                .duId(setup.du().getId())
                .nozzleNumber(2)
                .fuelType(FuelType.PETROL)
                .lastReading(BigDecimal.ZERO)
                .build());

        JsonNode tanks = step(checklist(setup.pumpId(), setup.owner()), "TANKS");

        assertThat(tanks.get("done").asBoolean()).isFalse();
        assertThat(tanks.get("detail").asText()).isEqualTo("1 nozzle not linked to a tank");
        assertThat(tanks.get("detailCode").asText()).isEqualTo("SETUP_NOZZLES_NOT_LINKED");
        assertThat(tanks.get("detailParams").get("count").asLong()).isEqualTo(1);
    }

    @Test
    void fuelSoldWithoutAPriceLeavesThePriceStepOpenUntilAPriceIsSetOnAnyDay() throws Exception {
        PumpLocation pump = bareOwnerPump();
        DispensaryUnit du = duRepository.save(DispensaryUnit.builder().pumpId(pump.getId()).duNumber(1).name("DU-" + shortId()).build());
        nozzleRepository.save(Nozzle.builder().duId(du.getId()).nozzleNumber(1).fuelType(FuelType.DIESEL)
                .lastReading(BigDecimal.ZERO).build());
        User owner = userRepository.findById(pump.getOwnerId()).orElseThrow();

        JsonNode unpriced = step(checklist(pump.getId(), owner), "FUEL_PRICES");
        assertThat(unpriced.get("done").asBoolean()).isFalse();
        assertThat(unpriced.get("detail").asText()).isEqualTo("1 fuel without a price");
        assertThat(unpriced.get("detailCode").asText()).isEqualTo("SETUP_FUEL_PRICES_UNPRICED");

        fuelPriceRepository.save(GlobalFuelPrice.builder().pumpId(pump.getId()).fuelType(FuelType.DIESEL)
                .pricePerUnit(new BigDecimal("90.00")).effectiveFrom(TestDates.now().minusDays(2))
                .setByUserId(owner.getId()).build());

        JsonNode priced = step(checklist(pump.getId(), owner), "FUEL_PRICES");
        assertThat(priced.get("done").asBoolean()).isTrue();
        assertThat(priced.get("detailCode").asText()).isEqualTo("SETUP_FUEL_PRICES_SET");
    }

    @Test
    void newPumpWithNothingSetUpHasNoStepsDone() throws Exception {
        PumpLocation pump = bareOwnerPump();
        User owner = userRepository.findById(pump.getOwnerId()).orElseThrow();

        JsonNode checklist = checklist(pump.getId(), owner);

        assertThat(checklist.get("doneCount").asInt()).isZero();
        checklist.get("items").forEach(item -> assertThat(item.get("done").asBoolean()).isFalse());
        assertThat(step(checklist, "DISPENSERS").get("detail").asText()).isEqualTo("Add a dispensing unit and its nozzles");
    }

    @Test
    void onlyTheOwnerOrAdminOfThePumpCanReadTheChecklist() throws Exception {
        perform(get("/api/pumps/{pumpId}/setup-checklist", setup.pumpId()), setup.manager())
                .andExpect(status().isForbidden());
        perform(get("/api/pumps/{pumpId}/setup-checklist", setup.pumpId()), setup.operator())
                .andExpect(status().isForbidden());
        perform(get("/api/pumps/{pumpId}/setup-checklist", setup.pumpId()), bareOwnerPumpOwner())
                .andExpect(status().isForbidden());
    }

    @Test
    void superAdminOwnerListShowsEachPumpsSetupProgress() throws Exception {
        User superAdmin = saveUser(UserRole.SUPER_ADMIN, null);

        JsonNode owners = json(perform(get("/api/super-admin/owners"), superAdmin).andExpect(status().isOk()));

        JsonNode pump = null;
        for (JsonNode owner : owners) {
            if (owner.get("ownerId").asLong() == setup.owner().getId()) {
                pump = owner.get("pumps").get(0);
            }
        }
        assertThat(pump).isNotNull();
        assertThat(pump.get("setupDoneCount").asInt()).isEqualTo(5);
        assertThat(pump.get("setupRequiredCount").asInt()).isEqualTo(6);
    }

    private PumpLocation bareOwnerPump() {
        User owner = saveUser(UserRole.OWNER, null);
        return pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(owner.getId())
                .name("Pump " + shortId())
                .address("Test address")
                .maxDuCount(2)
                .build());
    }

    private User bareOwnerPumpOwner() {
        return userRepository.findById(bareOwnerPump().getOwnerId()).orElseThrow();
    }

    private JsonNode checklist(Long pumpId, User user) throws Exception {
        return json(perform(get("/api/pumps/{pumpId}/setup-checklist", pumpId), user).andExpect(status().isOk()));
    }

    private static JsonNode step(JsonNode checklist, String step) {
        for (JsonNode item : checklist.get("items")) {
            if (step.equals(item.get("step").asText())) {
                return item;
            }
        }
        throw new AssertionError("No " + step + " step in " + checklist);
    }
}
