package com.ppms.shift;

import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.DispensaryUnitRepository;
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
    private final DispensaryUnitRepository duRepository;
    private final UserRepository userRepository;
    private final ShiftFuelReadingRepository fuelReadingRepository;
    private final ShiftCreditEntryRepository creditEntryRepository;
    private final ShiftNozzleRepository shiftNozzleRepository;

    public ShiftResponse toResponseWithLookups(Shift shift) {
        List<Long> nozzleIds = shiftNozzleRepository.findNozzleIdsByShiftId(shift.getId());
        List<Nozzle> nozzles = nozzleRepository.findAllById(nozzleIds);
        DispensaryUnit du = duRepository.findById(shift.getDuId()).orElse(null);
        User operator = userRepository.findById(shift.getOperatorId()).orElse(null);
        String openedByName = userRepository.findById(shift.getOpenedByUserId())
                .map(User::getFullName)
                .orElse(null);
        List<ShiftFuelReading> readings = fuelReadingRepository.findByShiftId(shift.getId());
        List<ShiftCreditEntry> entries = creditEntryRepository.findByShiftId(shift.getId());
        return toResponse(shift, du, nozzles, operator, openedByName, readings, entries);
    }

    public ShiftResponse toResponse(Shift shift, DispensaryUnit du, List<Nozzle> nozzles,
                                    User operator, String openedByName,
                                    List<ShiftFuelReading> readings, List<ShiftCreditEntry> entries) {

        List<ShiftResponse.NozzleSummary> nozzleSummaries = nozzles.stream()
                .map(n -> new ShiftResponse.NozzleSummary(n.getId(), n.getNozzleNumber(), n.getFuelType().name()))
                .toList();

        List<ShiftResponse.FuelReadingResponse> fuelReadingResponses = readings.stream()
                .map(r -> new ShiftResponse.FuelReadingResponse(
                        r.getNozzleId(),
                        r.getFuelType(),
                        r.getStartReading(),
                        r.getEndReading(),
                        r.getPriceSnapshot(),
                        r.getUnitsSold()))
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
                .duId(shift.getDuId())
                .duNumber(du != null ? du.getDuNumber() : null)
                .duName(du != null ? du.getName() : null)
                .nozzles(nozzleSummaries)
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
