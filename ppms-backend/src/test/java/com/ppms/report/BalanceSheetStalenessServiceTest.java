package com.ppms.report;

import com.ppms.common.text.ServerTextCodes;
import com.ppms.fuel.FuelType;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.pump.PumpShiftDefinition;
import com.ppms.pump.PumpShiftDefinitionRepository;
import com.ppms.support.PostgresTestContainerConfig;
import com.ppms.support.TestDates;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Only the sheets that include a change are flagged, and a sheet keeps the first reason it went stale for. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({PostgresTestContainerConfig.class, BalanceSheetStalenessService.class})
class BalanceSheetStalenessServiceTest {

    @Autowired private BalanceSheetStalenessService stalenessService;
    @Autowired private BalanceSheetRepository balanceSheetRepository;
    @Autowired private PumpLocationRepository pumpLocationRepository;
    @Autowired private PumpShiftDefinitionRepository shiftDefinitionRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private EntityManager entityManager;

    private Long pumpId;
    private Long ownerId;
    private Long morningShiftId;
    private Long eveningShiftId;
    private final LocalDate today = TestDates.today();

    @BeforeEach
    void createPumpWithTwoShifts() {
        ownerId = userRepository.save(User.builder()
                .employeeId("EMP-" + shortId()).fullName("Owner " + shortId())
                .phoneNumber("8" + String.format("%09d", Math.abs(System.nanoTime()) % 1_000_000_000L))
                .passwordHash("hash").role(UserRole.OWNER).status(UserStatus.ACTIVE).dateOfJoining(today)
                .build()).getId();
        pumpId = pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(ownerId).name("Pump " + shortId()).address("Address").maxDuCount(2).build()).getId();
        morningShiftId = saveShiftDefinition("Morning", LocalTime.of(6, 0), LocalTime.of(14, 0), 1);
        eveningShiftId = saveShiftDefinition("Evening", LocalTime.of(14, 0), LocalTime.of(22, 0), 2);
    }

    @Test
    void closedShiftFlagsTheDaySheetAndItsOwnShiftSheetButNotOtherShiftsOrDays() {
        BalanceSheet daySheet = saveSheet(BalanceSheetReportType.DAY, today, null);
        BalanceSheet ownShiftSheet = saveSheet(BalanceSheetReportType.SHIFT, today, morningShiftId);
        BalanceSheet otherShiftSheet = saveSheet(BalanceSheetReportType.SHIFT, today, eveningShiftId);
        BalanceSheet yesterdaySheet = saveSheet(BalanceSheetReportType.DAY, today.minusDays(1), null);

        stalenessService.markSheetsOfShiftStale(pumpId, today, morningShiftId, StaleReasons.shiftClosed(1L));

        assertThat(staleFlagsOf(daySheet, ownShiftSheet, otherShiftSheet, yesterdaySheet))
                .containsExactly(true, true, false, false);
    }

    @Test
    void daySheetOnlyChangeLeavesShiftSheetsAlone() {
        BalanceSheet daySheet = saveSheet(BalanceSheetReportType.DAY, today, null);
        BalanceSheet shiftSheet = saveSheet(BalanceSheetReportType.SHIFT, today, morningShiftId);

        stalenessService.markDaySheetsStale(pumpId, List.of(today), StaleReasons.cashRecovered(1L));

        assertThat(staleFlagsOf(daySheet, shiftSheet)).containsExactly(true, false);
    }

    @Test
    void sheetKeepsTheFirstReasonItWentStaleFor() {
        BalanceSheet daySheet = saveSheet(BalanceSheetReportType.DAY, today, null);

        stalenessService.markAllSheetsStale(pumpId, List.of(today), StaleReasons.dipCheckRecorded("T1"));
        stalenessService.markAllSheetsStale(pumpId, List.of(today), StaleReasons.drainRecorded("5.000"));

        entityManager.clear();
        BalanceSheet stored = balanceSheetRepository.findById(daySheet.getId()).orElseThrow();
        assertThat(stored.getStaleReason()).isEqualTo("A dip check on tank 'T1' was recorded after this sheet was generated.");
        assertThat(stored.getStaleReasonCode()).isEqualTo(ServerTextCodes.STALE_DIP_CHECK_RECORDED);
        assertThat(stored.getStaleReasonParams()).isEqualTo(Map.of("tankIdentifier", "T1"));
    }

    @Test
    void storesTheCodeAndParamsOfTheReasonBesideItsEnglishText() {
        BalanceSheet daySheet = saveSheet(BalanceSheetReportType.DAY, today, null);

        stalenessService.markAllSheetsStale(pumpId, List.of(today),
                StaleReasons.fuelCostCorrected(FuelType.DIESEL, "INV-7", "90.000", "80.000"));

        entityManager.clear();
        BalanceSheet stored = balanceSheetRepository.findById(daySheet.getId()).orElseThrow();
        assertThat(stored.getStaleReason()).isEqualTo(
                "The purchase cost of DIESEL delivery (invoice INV-7) was corrected ₹90.000 → ₹80.000/L after this sheet was generated.");
        assertThat(stored.getStaleReasonCode()).isEqualTo(ServerTextCodes.STALE_FUEL_COST_CORRECTED);
        assertThat(stored.getStaleReasonParams()).containsExactlyInAnyOrderEntriesOf(Map.of(
                "fuelTypeCode", "DIESEL", "invoiceReference", "INV-7", "oldCost", "90.000", "newCost", "80.000"));
    }

    private BalanceSheet saveSheet(BalanceSheetReportType type, LocalDate date, Long shiftDefinitionId) {
        return balanceSheetRepository.saveAndFlush(BalanceSheet.builder()
                .pumpId(pumpId).reportType(type).reportDate(date).shiftDefinitionId(shiftDefinitionId)
                .periodLabel("Sheet " + shortId()).generatedByUserId(ownerId)
                .build());
    }

    private Long saveShiftDefinition(String name, LocalTime start, LocalTime end, int sortOrder) {
        return shiftDefinitionRepository.save(PumpShiftDefinition.builder()
                .pumpId(pumpId).name(name).startTime(start).endTime(end)
                .crossesMidnight(false).isNightShift(false).sortOrder(sortOrder)
                .effectiveFrom(today.minusYears(1)).createdByUserId(ownerId)
                .build()).getId();
    }

    private List<Boolean> staleFlagsOf(BalanceSheet... sheets) {
        entityManager.clear();
        return Arrays.stream(sheets)
                .map(sheet -> balanceSheetRepository.findById(sheet.getId()).orElseThrow().isStale())
                .toList();
    }

    private static String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
