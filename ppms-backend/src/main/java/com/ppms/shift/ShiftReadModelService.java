package com.ppms.shift;

import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ShiftReadModelService {

    private final NozzleRepository nozzleRepository;
    private final UserRepository userRepository;
    private final ShiftFuelReadingRepository fuelReadingRepository;
    private final ShiftCreditEntryRepository creditEntryRepository;

    public ShiftResponse toResponseWithLookups(Shift shift) {
        Nozzle nozzle = nozzleRepository.findById(shift.getNozzleId()).orElse(null);
        User operator = userRepository.findById(shift.getOperatorId()).orElse(null);
        String openedByName = userRepository.findById(shift.getOpenedByUserId())
                .map(User::getFullName)
                .orElse(null);
        List<ShiftFuelReading> readings = fuelReadingRepository.findByShiftId(shift.getId());
        List<ShiftCreditEntry> entries = creditEntryRepository.findByShiftId(shift.getId());
        return toResponse(shift, nozzle, operator, openedByName, readings, entries);
    }

    public ShiftResponse toResponse(Shift shift, Nozzle nozzle, User operator, String openedByName,
                                    List<ShiftFuelReading> readings, List<ShiftCreditEntry> entries) {
        List<ShiftResponse.FuelReadingResponse> fuelReadingResponses = readings.stream()
                .map(reading -> new ShiftResponse.FuelReadingResponse(
                        reading.getOutletId(),
                        reading.getFuelType(),
                        reading.getStartReading(),
                        reading.getEndReading(),
                        reading.getPriceSnapshot(),
                        reading.getUnitsSold()))
                .toList();

        List<ShiftResponse.CreditEntryResponse> creditEntryResponses = entries.stream()
                .map(entry -> new ShiftResponse.CreditEntryResponse(
                        entry.getId(),
                        entry.getClientName(),
                        entry.getBillNo(),
                        entry.getAmount(),
                        entry.getFuelType(),
                        entry.getDescription(),
                        entry.getVoidStatus(),
                        entry.getVoidReason(),
                        entry.getVehicleRegistration(),
                        entry.getDriverName()))
                .toList();

        return ShiftResponse.builder()
                .id(shift.getId())
                .pumpId(shift.getPumpId())
                .nozzleId(shift.getNozzleId())
                .nozzleNumber(nozzle != null ? nozzle.getNozzleNumber() : null)
                .operatorId(shift.getOperatorId())
                .operatorName(operator != null ? operator.getFullName() : null)
                .openedByUserName(openedByName)
                .shiftWindow(shift.getShiftName())
                .shiftDate(shift.getShiftDate())
                .actualStartTime(shift.getActualStartTime())
                .actualEndTime(shift.getActualEndTime())
                .fuelReadings(fuelReadingResponses)
                .totalAmountDue(shift.getTotalAmountDue())
                .cashCollected(shift.getCashCollected())
                .upiCollected(shift.getUpiCollected())
                .cardCollected(shift.getCardCollected())
                .fleetCardCollected(shift.getFleetCardCollected())
                .creditTotal(shift.getCreditTotal())
                .discrepancyAmount(shift.getDiscrepancyAmount())
                .discrepancyType(shift.getDiscrepancyType() != null ? shift.getDiscrepancyType().name() : null)
                .discrepancyReason(shift.getDiscrepancyReason())
                .discrepancyResolution(shift.getDiscrepancyResolution() != null ? shift.getDiscrepancyResolution().name() : null)
                .discrepancyResolutionNote(shift.getDiscrepancyResolutionNote())
                .status(shift.getStatus().name())
                .creditEntries(creditEntryResponses)
                .build();
    }
}
