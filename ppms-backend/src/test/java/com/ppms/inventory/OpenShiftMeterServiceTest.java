package com.ppms.inventory;

import com.ppms.common.exception.BusinessException;
import com.ppms.fuel.FuelType;
import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.DispensaryUnitRepository;
import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleRepository;
import com.ppms.pump.UndergroundTank;
import com.ppms.shift.ShiftFuelReading;
import com.ppms.shift.ShiftFuelReadingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OpenShiftMeterServiceTest {

    private static final Long TANK_ID = 3L;
    private static final Long NOZZLE_ID = 11L;
    private static final BigDecimal MAX_METER = new BigDecimal("999999.999");

    @Mock private ShiftFuelReadingRepository fuelReadingRepository;
    @Mock private NozzleRepository nozzleRepository;
    @Mock private DispensaryUnitRepository duRepository;
    @InjectMocks private OpenShiftMeterService openShiftMeterService;

    private final UndergroundTank tank = UndergroundTank.builder().id(TANK_ID).tankIdentifier("T-1").build();

    @BeforeEach
    void mapNozzleToDispensaryUnit() {
        when(nozzleRepository.findAllById(any())).thenReturn(List.of(Nozzle.builder()
                .id(NOZZLE_ID).duId(5L).nozzleNumber(2).fuelType(FuelType.PETROL).maxMeterValue(MAX_METER).build()));
        when(duRepository.findAllById(any())).thenReturn(List.of(DispensaryUnit.builder().id(5L).name("DU-1").build()));
    }

    @Test
    void meterThatRolledOverSinceTheShiftOpenedCountsTheUnitsAcrossZero() {
        openShiftStartingAt("999990.000");

        List<DipCheckNozzleReading> sales = openShiftMeterService.salesSinceShiftOpen(tank, List.of(reading("5.001")));

        assertThat(sales).singleElement().satisfies(sale -> {
            assertThat(sale.getUnitsSold()).isEqualByComparingTo("15.000");
            assertThat(sale.getShiftId()).isEqualTo(7L);
        });
    }

    @Test
    void meterReadingAboveTheMeterMaximumIsRefused() {
        openShiftStartingAt("5000.000");

        assertThatThrownBy(() -> openShiftMeterService.salesSinceShiftOpen(tank, List.of(reading("1000000.000"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("exceeds the maximum meter value");
    }

    @Test
    void theSameNozzleTwiceIsRefused() {
        openShiftStartingAt("5000.000");

        assertThatThrownBy(() -> openShiftMeterService.salesSinceShiftOpen(tank, List.of(reading("5010.000"), reading("5020.000"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("only appear once");
    }

    @Test
    void noOpenShiftAndNoReadingsMeansNothingWasSoldSinceAShiftOpened() {
        when(fuelReadingRepository.findOpenShiftReadingsByTankId(TANK_ID)).thenReturn(List.of());

        assertThat(openShiftMeterService.salesSinceShiftOpen(tank, List.of())).isEmpty();
    }

    private void openShiftStartingAt(String start) {
        when(fuelReadingRepository.findOpenShiftReadingsByTankId(TANK_ID)).thenReturn(List.of(ShiftFuelReading.builder()
                .shiftId(7L)
                .nozzleId(NOZZLE_ID)
                .fuelType(FuelType.PETROL)
                .tankId(TANK_ID)
                .startReading(new BigDecimal(start))
                .build()));
    }

    private static RecordDipCheckRequest.NozzleMeterReading reading(String meterReading) {
        return new RecordDipCheckRequest.NozzleMeterReading(NOZZLE_ID, new BigDecimal(meterReading));
    }
}
