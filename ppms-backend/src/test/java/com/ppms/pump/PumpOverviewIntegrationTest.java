package com.ppms.pump;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.fuel.FuelType;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestDates;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PumpOverviewIntegrationTest extends ApiIntegrationTest {

    @Autowired private ShiftRepository shiftRepository;

    private PumpSetup setup;

    @BeforeEach
    void createPump() throws Exception {
        setup = createPumpWithStock("5000");
    }

    @Test
    void ownerSeesTodaysFiguresForEachOfTheirEnabledPumpsAndNoOtherOwnersPump() throws Exception {
        PumpLocation secondPump = addPumpForSameOwner(true);
        DispensaryUnit secondPumpDu = addDispenser(secondPump);
        addTank(secondPump, "1000");
        addPumpForSameOwner(false);
        PumpSetup otherOwnersPump = createPumpWithStock("0");

        saveShift(setup.pumpId(), setup.du().getId(), TestDates.today(), ShiftStatus.CLOSED_BALANCED, "1200.50");
        saveShift(setup.pumpId(), setup.du().getId(), TestDates.today(), ShiftStatus.CLOSED_DISCREPANCY_PENDING, "300.00");
        saveShift(setup.pumpId(), setup.du().getId(), TestDates.today().minusDays(1), ShiftStatus.CLOSED_BALANCED, "999.00");
        saveShift(setup.pumpId(), setup.du().getId(), TestDates.today(), ShiftStatus.OPEN, null);
        saveShift(secondPump.getId(), secondPumpDu.getId(), TestDates.today(), ShiftStatus.OPEN_OVERDUE, null);
        saveShift(otherOwnersPump.pumpId(), otherOwnersPump.du().getId(), TestDates.today(), ShiftStatus.CLOSED_BALANCED, "5000.00");

        JsonNode overview = json(perform(get("/api/pumps/overview"), setup.owner()).andExpect(status().isOk()));

        assertThat(pumpIdsIn(overview)).containsExactlyInAnyOrder(setup.pumpId(), secondPump.getId());

        JsonNode first = summaryFor(overview, setup.pumpId());
        assertThat(first.get("name").asText()).isEqualTo(setup.pump().getName());
        assertThat(first.get("enabled").asBoolean()).isTrue();
        assertThat(first.get("todaySales").decimalValue()).isEqualByComparingTo("1500.50");
        assertThat(first.get("openShiftCount").asLong()).isEqualTo(1);
        assertThat(first.get("overdueShiftCount").asLong()).isZero();
        assertThat(first.get("lowStockTankCount").asLong()).isZero();
        assertThat(first.get("fuelPricesStale").asBoolean()).isFalse();

        JsonNode second = summaryFor(overview, secondPump.getId());
        assertThat(second.get("todaySales").decimalValue()).isEqualByComparingTo("0");
        assertThat(second.get("openShiftCount").asLong()).isEqualTo(1);
        assertThat(second.get("overdueShiftCount").asLong()).isEqualTo(1);
        assertThat(second.get("lowStockTankCount").asLong()).isEqualTo(1);
        assertThat(second.get("fuelPricesStale").asBoolean()).isTrue();

        JsonNode totals = overview.get("totals");
        assertThat(totals.get("todaySales").decimalValue()).isEqualByComparingTo("1500.50");
        assertThat(totals.get("openShiftCount").asLong()).isEqualTo(2);
        assertThat(totals.get("overdueShiftCount").asLong()).isEqualTo(1);
        assertThat(totals.get("lowStockTankCount").asLong()).isEqualTo(1);
        assertThat(totals.get("stalePricePumpCount").asLong()).isEqualTo(1);
    }

    @Test
    void staffSeeOnlyThePumpTheyAreAssignedTo() throws Exception {
        addPumpForSameOwner(true);

        JsonNode overview = json(perform(get("/api/pumps/overview"), setup.manager()).andExpect(status().isOk()));

        assertThat(pumpIdsIn(overview)).containsExactly(setup.pumpId());
    }

    @Test
    void queryCountDoesNotGrowWithTheNumberOfPumps() throws Exception {
        addPumpForSameOwner(true);
        long withTwoPumps = statementsRunBy(get("/api/pumps/overview"), setup.owner());

        addTank(addPumpForSameOwner(true), "100");
        addTank(addPumpForSameOwner(true), "100");
        long withFourPumps = statementsRunBy(get("/api/pumps/overview"), setup.owner());

        assertThat(withFourPumps).isEqualTo(withTwoPumps);
    }

    private PumpLocation addPumpForSameOwner(boolean enabled) {
        return pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(setup.owner().getId())
                .name("Pump " + shortId())
                .address("Test address")
                .maxDuCount(4)
                .enabled(enabled)
                .build());
    }

    private DispensaryUnit addDispenser(PumpLocation pump) {
        return duRepository.save(DispensaryUnit.builder()
                .pumpId(pump.getId())
                .duNumber(1)
                .name("DU-" + shortId())
                .build());
    }

    private void addTank(PumpLocation pump, String stockLitres) {
        tankRepository.save(UndergroundTank.builder()
                .pumpId(pump.getId())
                .tankIdentifier("T-" + shortId())
                .fuelType(FuelType.DIESEL)
                .capacity(new BigDecimal("20000"))
                .currentStock(new BigDecimal(stockLitres))
                .dipTolerance(new BigDecimal("50"))
                .status(TankStatus.ACTIVE)
                .build());
    }

    private void saveShift(Long pumpId, Long duId, LocalDate shiftDate, ShiftStatus status, String totalAmountDue) {
        shiftRepository.save(Shift.builder()
                .pumpId(pumpId)
                .duId(duId)
                .operatorId(setup.operator().getId())
                .openedByUserId(setup.manager().getId())
                .shiftDate(shiftDate)
                .actualStartTime(shiftDate.atStartOfDay(TestDates.BUSINESS_ZONE).toOffsetDateTime().plusHours(6))
                .status(status)
                .isOverdueFlag(status == ShiftStatus.OPEN_OVERDUE)
                .totalAmountDue(totalAmountDue != null ? new BigDecimal(totalAmountDue) : null)
                .build());
    }

    private static List<Long> pumpIdsIn(JsonNode overview) {
        List<Long> ids = new ArrayList<>();
        overview.get("pumps").forEach(pump -> ids.add(pump.get("pumpId").asLong()));
        return ids;
    }

    private static JsonNode summaryFor(JsonNode overview, Long pumpId) {
        for (JsonNode pump : overview.get("pumps")) {
            if (pump.get("pumpId").asLong() == pumpId) {
                return pump;
            }
        }
        throw new AssertionError("Pump " + pumpId + " missing from overview");
    }
}
