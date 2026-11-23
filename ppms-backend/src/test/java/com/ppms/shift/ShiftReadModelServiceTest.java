package com.ppms.shift;

import com.ppms.fuel.FuelType;
import com.ppms.pump.Nozzle;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(MockitoExtension.class)
class ShiftReadModelServiceTest {

    @InjectMocks private ShiftReadModelService service;

    @Test
    void listsNozzlesAndReadingsByNozzleNumberWhateverOrderTheyWereStoredIn() {
        Shift shift = Shift.builder().id(1L).pumpId(4L).duId(2L).operatorId(5L).status(ShiftStatus.OPEN).build();
        List<Nozzle> nozzles = List.of(nozzle(22L, 2, FuelType.DIESEL), nozzle(21L, 1, FuelType.PETROL));
        List<ShiftFuelReading> readings = List.of(reading(22L, FuelType.DIESEL), reading(21L, FuelType.PETROL));

        ShiftResponse response = service.toResponse(shift, null, nozzles, null, null, readings, List.of());

        assertThat(response.getNozzles()).extracting(ShiftResponse.NozzleSummary::nozzleNumber).containsExactly(1, 2);
        assertThat(response.getFuelReadings()).extracting(ShiftResponse.FuelReadingResponse::nozzleId).containsExactly(21L, 22L);
    }

    private static Nozzle nozzle(long id, int nozzleNumber, FuelType fuelType) {
        return Nozzle.builder().id(id).nozzleNumber(nozzleNumber).fuelType(fuelType)
                .maxMeterValue(new BigDecimal("99999999.999")).build();
    }

    private static ShiftFuelReading reading(long nozzleId, FuelType fuelType) {
        return ShiftFuelReading.builder().shiftId(1L).nozzleId(nozzleId).fuelType(fuelType)
                .startReading(BigDecimal.ZERO).priceSnapshot(new BigDecimal("100.00")).build();
    }
}
