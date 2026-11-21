package com.ppms.pump;

import com.ppms.fuel.FuelType;
import com.ppms.fuel.GlobalFuelPrice;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.inventory.InventoryResponseAssembler;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.support.FixedBusinessClock;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PumpOverviewServiceTest {

    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-03-06T10:00:00+05:30");
    private static final LocalDate TODAY = NOW.toLocalDate();
    private static final User OWNER = User.builder().id(1L).role(UserRole.OWNER).build();

    private final PumpService pumpService = mock(PumpService.class);
    private final ShiftRepository shiftRepository = mock(ShiftRepository.class);
    private final UndergroundTankRepository tankRepository = mock(UndergroundTankRepository.class);
    private final GlobalFuelPriceRepository fuelPriceRepository = mock(GlobalFuelPriceRepository.class);

    private final PumpOverviewService overviewService = new PumpOverviewService(pumpService, shiftRepository,
            tankRepository, fuelPriceRepository, new InventoryResponseAssembler(), new FixedBusinessClock(NOW));

    @Test
    void eachPumpGetsItsOwnFiguresAndTheTotalsAddThemUp() {
        when(pumpService.findMyPumps(OWNER)).thenReturn(List.of(pump(10L, "North"), pump(20L, "South")));
        List<Long> pumpIds = List.of(10L, 20L);
        when(shiftRepository.sumAmountDueByPumpForDate(pumpIds, TODAY)).thenReturn(List.<Object[]>of(
                new Object[]{10L, new BigDecimal("1500.50")},
                new Object[]{20L, new BigDecimal("499.50")}));
        when(shiftRepository.countOpenShiftsByPumpAndStatus(pumpIds)).thenReturn(List.<Object[]>of(
                new Object[]{10L, ShiftStatus.OPEN, 2L},
                new Object[]{10L, ShiftStatus.OPEN_OVERDUE, 1L},
                new Object[]{20L, ShiftStatus.AUTO_CLOSED_OVERDUE, 1L}));
        when(tankRepository.findByPumpIdIn(pumpIds)).thenReturn(List.of(
                tank(10L, "1000", TankStatus.ACTIVE),
                tank(10L, "9000", TankStatus.ACTIVE),
                tank(20L, "500", TankStatus.INACTIVE),
                tank(20L, "0", TankStatus.DECOMMISSIONED)));
        when(fuelPriceRepository.findCurrentPricesForPumps(pumpIds)).thenReturn(List.of(
                price(10L, NOW.minusHours(1)),
                price(20L, NOW.minusDays(1))));

        PumpOverviewResponse overview = overviewService.getOverview(OWNER);

        assertThat(overview.pumps()).containsExactly(
                new PumpOverviewSummary(10L, "North", true, new BigDecimal("1500.50"), 3, 1, 1, false),
                new PumpOverviewSummary(20L, "South", true, new BigDecimal("499.50"), 1, 0, 1, true));
        assertThat(overview.totals().todaySales()).isEqualByComparingTo("2000.00");
        assertThat(overview.totals().openShiftCount()).isEqualTo(4);
        assertThat(overview.totals().overdueShiftCount()).isEqualTo(1);
        assertThat(overview.totals().lowStockTankCount()).isEqualTo(2);
        assertThat(overview.totals().stalePricePumpCount()).isEqualTo(1);
    }

    @Test
    void pumpWithNoActivityHasZeroFiguresAndCountsAsStaleUntilItHasPrices() {
        when(pumpService.findMyPumps(OWNER)).thenReturn(List.of(pump(10L, "North")));

        PumpOverviewSummary summary = overviewService.getOverview(OWNER).pumps().get(0);

        assertThat(summary.todaySales()).isEqualByComparingTo("0");
        assertThat(summary.openShiftCount()).isZero();
        assertThat(summary.overdueShiftCount()).isZero();
        assertThat(summary.lowStockTankCount()).isZero();
        assertThat(summary.fuelPricesStale()).isTrue();
    }

    @Test
    void priceSetJustAfterMidnightIstCountsAsToday() {
        when(pumpService.findMyPumps(OWNER)).thenReturn(List.of(pump(10L, "North")));
        OffsetDateTime justAfterIstMidnight = TODAY.atStartOfDay().atOffset(ZoneOffset.ofHoursMinutes(5, 30))
                .plusMinutes(5).withOffsetSameInstant(ZoneOffset.UTC);
        when(fuelPriceRepository.findCurrentPricesForPumps(any())).thenReturn(List.of(price(10L, justAfterIstMidnight)));

        assertThat(overviewService.getOverview(OWNER).pumps().get(0).fuelPricesStale()).isFalse();
    }

    @Test
    void userWithNoPumpsGetsAnEmptyOverviewWithoutQueryingFigures() {
        when(pumpService.findMyPumps(OWNER)).thenReturn(List.of());

        PumpOverviewResponse overview = overviewService.getOverview(OWNER);

        assertThat(overview.pumps()).isEmpty();
        assertThat(overview.totals().todaySales()).isEqualByComparingTo("0");
        verifyNoInteractions(shiftRepository, tankRepository, fuelPriceRepository);
    }

    private static PumpLocation pump(Long id, String name) {
        return PumpLocation.builder().id(id).ownerId(OWNER.getId()).name(name).build();
    }

    private static UndergroundTank tank(Long pumpId, String stock, TankStatus status) {
        return UndergroundTank.builder()
                .pumpId(pumpId).tankIdentifier("T").fuelType(FuelType.PETROL)
                .capacity(new BigDecimal("10000")).currentStock(new BigDecimal(stock))
                .status(status).build();
    }

    private static GlobalFuelPrice price(Long pumpId, OffsetDateTime effectiveFrom) {
        return GlobalFuelPrice.builder()
                .pumpId(pumpId).fuelType(FuelType.PETROL)
                .pricePerUnit(new BigDecimal("100.00")).effectiveFrom(effectiveFrom).build();
    }
}
