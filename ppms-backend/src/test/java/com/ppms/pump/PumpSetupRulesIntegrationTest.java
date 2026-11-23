package com.ppms.pump;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.document.PumpDocument;
import com.ppms.document.PumpDocumentRepository;
import com.ppms.inventory.InventoryLot;
import com.ppms.inventory.InventoryLotRepository;
import com.ppms.inventory.LotConsumptionRepository;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestDates;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PumpSetupRulesIntegrationTest extends ApiIntegrationTest {

    @Autowired private PumpDocumentRepository documentRepository;
    @Autowired private InventoryLotRepository inventoryLotRepository;
    @Autowired private LotConsumptionRepository lotConsumptionRepository;

    private PumpSetup setup;

    @BeforeEach
    void createPump() throws Exception {
        setup = createPumpWithStock("5000");
    }

    @Test
    void nozzleReadingCanNoLongerBeOverwrittenDirectly() throws Exception {
        int status = perform(put("/api/pumps/{pumpId}/dus/{duId}/nozzles/{nozzleId}/reading",
                        setup.pumpId(), setup.du().getId(), setup.nozzle().getId()),
                setup.owner(), Map.of("reading", new BigDecimal("1")))
                .andReturn().getResponse().getStatus();

        assertThat(status).isIn(404, 405);
        assertThat(nozzleRepository.findById(setup.nozzle().getId()).orElseThrow().getLastReading())
                .isEqualByComparingTo("1000.000");
    }

    @Test
    void tankOfAnotherPumpCannotBeDisabledThroughThisPump() throws Exception {
        PumpSetup other = createPumpWithStock("0");

        perform(patch("/api/pumps/{pumpId}/tanks/{tankId}/status", setup.pumpId(), other.tank().getId()),
                setup.owner(), Map.of("status", "INACTIVE"))
                .andExpect(status().isNotFound());

        assertThat(tankRepository.findById(other.tank().getId()).orElseThrow().getStatus()).isEqualTo(TankStatus.ACTIVE);
    }

    @Test
    void tankCanBeDisabledOnceButNotSetToItsCurrentStatusOrDecommissionedHere() throws Exception {
        Long tankId = setup.tank().getId();

        perform(patch("/api/pumps/{pumpId}/tanks/{tankId}/status", setup.pumpId(), tankId),
                setup.owner(), Map.of("status", "ACTIVE"))
                .andExpect(status().isBadRequest());
        perform(patch("/api/pumps/{pumpId}/tanks/{tankId}/status", setup.pumpId(), tankId),
                setup.owner(), Map.of("status", "DECOMMISSIONED"))
                .andExpect(status().isBadRequest());
        perform(patch("/api/pumps/{pumpId}/tanks/{tankId}/status", setup.pumpId(), tankId),
                setup.manager(), Map.of("status", "INACTIVE"))
                .andExpect(status().isForbidden());
        perform(patch("/api/pumps/{pumpId}/tanks/{tankId}/status", setup.pumpId(), tankId),
                setup.admin(), Map.of("status", "INACTIVE"))
                .andExpect(status().isOk());

        UndergroundTank tank = tankRepository.findById(tankId).orElseThrow();
        assertThat(tank.getStatus()).isEqualTo(TankStatus.INACTIVE);
        assertThat(tank.getCurrentStock()).isEqualByComparingTo("5000");
    }

    @Test
    void nozzleNumberMustBeUniqueOnItsDispenserAndADispenserHoldsAtMostNineNozzles() throws Exception {
        Long duId = setup.du().getId();

        perform(post("/api/pumps/{pumpId}/dus/{duId}/nozzles", setup.pumpId(), duId), setup.owner(), nozzle(1, "PETROL"))
                .andExpect(status().isBadRequest());
        for (int number = 2; number <= 9; number++) {
            perform(post("/api/pumps/{pumpId}/dus/{duId}/nozzles", setup.pumpId(), duId), setup.owner(), nozzle(number, "PETROL"))
                    .andExpect(status().isCreated());
        }
        perform(post("/api/pumps/{pumpId}/dus/{duId}/nozzles", setup.pumpId(), duId), setup.owner(), nozzle(10, "PETROL"))
                .andExpect(status().isBadRequest());

        assertThat(nozzleRepository.findByDuIdOrderByNozzleNumberAsc(duId)).hasSize(9);
    }

    @Test
    void cngCannotBeMixedWithOtherFuelsOnOneDispenser() throws Exception {
        perform(post("/api/pumps/{pumpId}/dus/{duId}/nozzles", setup.pumpId(), setup.du().getId()),
                setup.owner(), nozzle(2, "CNG"))
                .andExpect(status().isBadRequest());

        assertThat(nozzleRepository.findByDuIdOrderByNozzleNumberAsc(setup.du().getId())).hasSize(1);
    }

    @Test
    void nozzleOfAnotherPumpsDispenserCannotBeAdded() throws Exception {
        PumpSetup other = createPumpWithStock("0");

        perform(post("/api/pumps/{pumpId}/dus/{duId}/nozzles", setup.pumpId(), other.du().getId()),
                setup.owner(), nozzle(2, "PETROL"))
                .andExpect(status().isNotFound());

        assertThat(nozzleRepository.findByDuIdOrderByNozzleNumberAsc(other.du().getId())).hasSize(1);
    }

    @Test
    void disabledNozzleCannotOpenAShiftAndANozzleInUseCannotBeDisabled() throws Exception {
        String nozzleStatusUrl = "/api/pumps/{pumpId}/dus/{duId}/nozzles/{nozzleId}/status";
        Long duId = setup.du().getId();
        Long nozzleId = setup.nozzle().getId();

        perform(patch(nozzleStatusUrl, setup.pumpId(), duId, nozzleId), setup.owner(), Map.of("status", "INACTIVE"))
                .andExpect(status().isOk());
        openShift().andExpect(status().isBadRequest());

        perform(patch(nozzleStatusUrl, setup.pumpId(), duId, nozzleId), setup.owner(), Map.of("status", "ACTIVE"))
                .andExpect(status().isOk());
        openShift().andExpect(status().is2xxSuccessful());

        perform(patch(nozzleStatusUrl, setup.pumpId(), duId, nozzleId), setup.owner(), Map.of("status", "INACTIVE"))
                .andExpect(status().isBadRequest());
        perform(patch("/api/pumps/{pumpId}/dus/{duId}/status", setup.pumpId(), duId), setup.owner(), Map.of("status", "INACTIVE"))
                .andExpect(status().isBadRequest());
        assertThat(nozzleRepository.findById(nozzleId).orElseThrow().getStatus()).isEqualTo(NozzleStatus.ACTIVE);
        assertThat(duRepository.findById(duId).orElseThrow().getStatus()).isEqualTo(NozzleStatus.ACTIVE);
    }

    @Test
    void dispenserLimitCannotDropBelowTheDispensersAlreadyConfigured() throws Exception {
        perform(post("/api/pumps/{pumpId}/dus", setup.pumpId()), setup.owner(),
                Map.of("name", "Machine " + shortId(), "nozzles", List.of(nozzle(1, "PETROL"))))
                .andExpect(status().is2xxSuccessful());

        perform(patch("/api/pumps/{pumpId}/max-dus", setup.pumpId()), setup.owner(), Map.of("maxDuCount", 1))
                .andExpect(status().isBadRequest());
        perform(patch("/api/pumps/{pumpId}/max-dus", setup.pumpId()), setup.owner(), Map.of("maxDuCount", 6))
                .andExpect(status().isOk());

        assertThat(pumpLocationRepository.findById(setup.pumpId()).orElseThrow().getMaxDuCount()).isEqualTo(6);
    }

    @Test
    void shiftScheduleThatHasShiftsCannotBeDeletedButAnUnusedOneCan() throws Exception {
        LocalDate usedFrom = setup.allDayShift().getEffectiveFrom();
        openShift().andExpect(status().is2xxSuccessful());

        perform(delete("/api/pumps/{pumpId}/shift-definitions", setup.pumpId()).param("effectiveFrom", usedFrom.toString()),
                setup.owner())
                .andExpect(status().isBadRequest());
        assertThat(shiftDefinitionRepository.findById(setup.allDayShift().getId())).isPresent();

        PumpSetup unused = createPumpWithStock("0");
        perform(delete("/api/pumps/{pumpId}/shift-definitions", unused.pumpId())
                        .param("effectiveFrom", unused.allDayShift().getEffectiveFrom().toString()),
                unused.manager())
                .andExpect(status().isForbidden());
        perform(delete("/api/pumps/{pumpId}/shift-definitions", unused.pumpId())
                        .param("effectiveFrom", unused.allDayShift().getEffectiveFrom().toString()),
                unused.owner())
                .andExpect(status().isNoContent());
        assertThat(shiftDefinitionRepository.findById(unused.allDayShift().getId())).isEmpty();
    }

    @Test
    void documentOfAnotherPumpCannotBeEditedOrDeleted() throws Exception {
        PumpSetup other = createPumpWithStock("0");
        long othersDocumentId = addDocument(other, "PESO licence", TestDates.today().plusDays(90));

        perform(put("/api/pumps/{pumpId}/documents/{id}", setup.pumpId(), othersDocumentId), setup.owner(),
                document("Renamed", TestDates.today().plusDays(1)))
                .andExpect(status().isNotFound());
        perform(delete("/api/pumps/{pumpId}/documents/{id}", setup.pumpId(), othersDocumentId), setup.owner())
                .andExpect(status().isNotFound());

        PumpDocument untouched = documentRepository.findById(othersDocumentId).orElseThrow();
        assertThat(untouched.getName()).isEqualTo("PESO licence");
        assertThat(untouched.getPumpId()).isEqualTo(other.pumpId());
    }

    @Test
    void editingADocumentRecomputesItsStatusAndOnlyTheOwnerCanDeleteIt() throws Exception {
        long documentId = addDocument(setup, "Weights and measures", TestDates.today().plusDays(90));

        JsonNode expiringSoon = json(perform(put("/api/pumps/{pumpId}/documents/{id}", setup.pumpId(), documentId),
                setup.admin(), document("Weights and measures", TestDates.today().plusDays(30)))
                .andExpect(status().isOk()));
        assertThat(expiringSoon.get("status").asText()).isEqualTo("EXPIRING_SOON");
        JsonNode valid = json(perform(put("/api/pumps/{pumpId}/documents/{id}", setup.pumpId(), documentId),
                setup.admin(), document("Weights and measures", TestDates.today().plusDays(31)))
                .andExpect(status().isOk()));
        assertThat(valid.get("status").asText()).isEqualTo("VALID");
        JsonNode expired = json(perform(put("/api/pumps/{pumpId}/documents/{id}", setup.pumpId(), documentId),
                setup.admin(), document("Weights and measures", TestDates.today().minusDays(1)))
                .andExpect(status().isOk()));
        assertThat(expired.get("status").asText()).isEqualTo("EXPIRED");

        perform(delete("/api/pumps/{pumpId}/documents/{id}", setup.pumpId(), documentId), setup.admin())
                .andExpect(status().isForbidden());
        perform(delete("/api/pumps/{pumpId}/documents/{id}", setup.pumpId(), documentId), setup.owner())
                .andExpect(status().isNoContent());
        assertThat(documentRepository.findById(documentId)).isEmpty();
    }

    @Test
    void onlyTheSuperAdminCreatesPumpsAndNotTwiceUnderTheSameName() throws Exception {
        User superAdmin = saveUser(UserRole.SUPER_ADMIN, null);
        Map<String, Object> pump = Map.of("name", "Highway " + shortId(), "address", "NH 48", "maxDuCount", 4);

        perform(post("/api/pumps"), setup.owner(), pump).andExpect(status().isForbidden());
        JsonNode created = json(perform(post("/api/pumps"), superAdmin, pump).andExpect(status().isCreated()));
        perform(post("/api/pumps"), superAdmin, pump).andExpect(status().isBadRequest());

        assertThat(pumpLocationRepository.findById(created.get("id").asLong()).orElseThrow().getName())
                .isEqualTo(pump.get("name"));
    }

    @Test
    void adminCannotPromoteStaffToAdminOrOwnerAndTheRoleStaysAsItWas() throws Exception {
        for (String role : List.of("ADMIN", "OWNER", "SUPER_ADMIN")) {
            perform(patch("/api/users/{userId}/details", setup.operator().getId()), setup.admin(), Map.of("role", role))
                    .andExpect(status().isBadRequest());
        }

        assertThat(userRepository.findById(setup.operator().getId()).orElseThrow().getRole()).isEqualTo(UserRole.OPERATOR);
    }

    @Test
    void changingAStaffMembersPhoneSignsThemOutAndRefusesANumberAlreadyInUse() throws Exception {
        var operatorSession = loginAs(setup.operator());

        perform(patch("/api/users/{userId}/details", setup.operator().getId()), setup.owner(),
                Map.of("phoneNumber", setup.manager().getPhoneNumber()))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/pumps").cookie(operatorSession)).andExpect(status().isOk());

        perform(patch("/api/users/{userId}/details", setup.operator().getId()), setup.owner(),
                Map.of("phoneNumber", "5" + String.format("%09d", Math.abs(System.nanoTime()) % 1_000_000_000L)))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/pumps").cookie(operatorSession)).andExpect(status().isUnauthorized());
    }

    @Test
    void ownerAccountsCannotBeEditedAsStaffAndNightConsentIsDroppedWhenAnOperatorIsNoLongerFemale() throws Exception {
        perform(patch("/api/users/{userId}/details", setup.owner().getId()), setup.owner(), Map.of("fullName", "Renamed"))
                .andExpect(status().is4xxClientError());
        assertThat(userRepository.findById(setup.owner().getId()).orElseThrow().getFullName())
                .isEqualTo(setup.owner().getFullName());

        Long operatorId = setup.operator().getId();
        perform(patch("/api/users/{userId}/details", operatorId), setup.owner(),
                Map.of("gender", "FEMALE", "nightShiftConsent", true))
                .andExpect(status().isOk());
        assertThat(userRepository.findById(operatorId).orElseThrow().isNightShiftConsent()).isTrue();

        perform(patch("/api/users/{userId}/details", operatorId), setup.owner(),
                Map.of("gender", "MALE", "nightShiftConsent", true))
                .andExpect(status().isOk());
        assertThat(userRepository.findById(operatorId).orElseThrow().isNightShiftConsent()).isFalse();
    }

    @Test
    void tankWithStockButNoLotsGetsOneLotForItsStockWhenAShiftCloses() throws Exception {
        PumpSetup noLots = createPumpWithStock("0");
        UndergroundTank tank = tankRepository.findById(noLots.tank().getId()).orElseThrow();
        tank.setCurrentStock(new BigDecimal("500.000"));
        tankRepository.save(tank);

        JsonNode opened = json(perform(post("/api/pumps/{pumpId}/shifts/open", noLots.pumpId()), noLots.manager(),
                Map.of("duId", noLots.du().getId(), "nozzleIds", List.of(noLots.nozzle().getId()),
                        "operatorId", noLots.operator().getId()))
                .andExpect(status().is2xxSuccessful()));
        long shiftId = opened.get("id").asLong();
        Map<String, Object> close = new HashMap<>();
        close.put("fuelReadings", List.of(Map.of("nozzleId", noLots.nozzle().getId(), "endReading", new BigDecimal("1010.000"))));
        close.put("cashCollected", new BigDecimal("1000.00"));
        close.put("upiCollected", BigDecimal.ZERO);
        close.put("cardCollected", BigDecimal.ZERO);
        close.put("fleetCardCollected", BigDecimal.ZERO);
        close.put("creditTotal", BigDecimal.ZERO);
        close.put("creditEntries", List.of());
        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", noLots.pumpId(), shiftId), noLots.manager(), close)
                .andExpect(status().is2xxSuccessful());

        List<InventoryLot> lots = inventoryLotRepository.findAllByTankIdOrdered(tank.getId());
        assertThat(lots).hasSize(1);
        assertThat(lots.get(0).getOriginalQuantity()).isEqualByComparingTo("500");
        assertThat(lots.get(0).getRemainingQuantity()).isEqualByComparingTo("490");
        assertThat(lotConsumptionRepository.findByShiftIdIn(List.of(shiftId))).hasSize(1);
        assertThat(tankRepository.findById(tank.getId()).orElseThrow().getCurrentStock()).isEqualByComparingTo("490");
    }

    private org.springframework.test.web.servlet.ResultActions openShift() throws Exception {
        return perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()));
    }

    private static Map<String, Object> nozzle(int number, String fuelType) {
        return Map.of("nozzleNumber", number, "fuelType", fuelType, "initialReading", new BigDecimal("0"));
    }

    private long addDocument(PumpSetup pump, String name, LocalDate expiryDate) throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/documents", pump.pumpId()), pump.owner(), document(name, expiryDate))
                .andExpect(status().isCreated())).get("id").asLong();
    }

    private static Map<String, Object> document(String name, LocalDate expiryDate) {
        return Map.of("name", name, "docType", "LICENCE", "expiryDate", expiryDate.toString());
    }
}
