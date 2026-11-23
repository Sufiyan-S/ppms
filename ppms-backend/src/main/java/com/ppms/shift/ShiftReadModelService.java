package com.ppms.shift;

import com.ppms.common.time.BusinessClock;
import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.DispensaryUnitRepository;
import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleRepository;
import com.ppms.pump.PumpShiftDefinition;
import com.ppms.pump.PumpShiftDefinitionRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ShiftReadModelService {

    private final NozzleRepository nozzleRepository;
    private final DispensaryUnitRepository duRepository;
    private final UserRepository userRepository;
    private final ShiftFuelReadingRepository fuelReadingRepository;
    private final ShiftCreditEntryRepository creditEntryRepository;
    private final ShiftNozzleRepository shiftNozzleRepository;
    private final PumpShiftDefinitionRepository shiftDefinitionRepository;
    private final BusinessClock businessClock;

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
        String investigatedByName = shift.getInvestigationStartedById() == null ? null
                : userRepository.findById(shift.getInvestigationStartedById()).map(User::getFullName).orElse(null);
        return toResponse(shift, du, nozzles, operator, openedByName, investigatedByName, readings, entries,
                computeScheduledEndTime(shift));
    }

    /** List-page variant of {@link #toResponseWithLookups}: loads every related row for all shifts in one query per table. */
    public List<ShiftResponse> toResponsesWithLookups(List<Shift> shifts) {
        if (shifts.isEmpty()) {
            return List.of();
        }
        List<Long> shiftIds = shifts.stream().map(Shift::getId).toList();

        Map<Long, List<Long>> nozzleIdsByShiftId = shiftNozzleRepository.findByShiftIdIn(shiftIds).stream()
                .collect(Collectors.groupingBy(ShiftNozzle::getShiftId,
                        Collectors.mapping(ShiftNozzle::getNozzleId, Collectors.toList())));
        Map<Long, Nozzle> nozzleById = findAllByIdAsMap(nozzleRepository,
                nozzleIdsByShiftId.values().stream().flatMap(List::stream).collect(Collectors.toSet()), Nozzle::getId);
        Map<Long, DispensaryUnit> duById = findAllByIdAsMap(duRepository,
                shifts.stream().map(Shift::getDuId).filter(Objects::nonNull).collect(Collectors.toSet()), DispensaryUnit::getId);
        Set<Long> userIds = new HashSet<>();
        shifts.forEach(shift -> {
            userIds.add(shift.getOperatorId());
            userIds.add(shift.getOpenedByUserId());
            userIds.add(shift.getInvestigationStartedById());
        });
        userIds.remove(null);
        Map<Long, User> userById = findAllByIdAsMap(userRepository, userIds, User::getId);
        Map<Long, PumpShiftDefinition> definitionById = findAllByIdAsMap(shiftDefinitionRepository,
                shifts.stream().map(Shift::getShiftDefinitionId).filter(Objects::nonNull).collect(Collectors.toSet()),
                PumpShiftDefinition::getId);
        Map<Long, List<ShiftFuelReading>> readingsByShiftId = fuelReadingRepository.findByShiftIdIn(shiftIds).stream()
                .collect(Collectors.groupingBy(ShiftFuelReading::getShiftId));
        Map<Long, List<ShiftCreditEntry>> entriesByShiftId = creditEntryRepository.findByShiftIdIn(shiftIds).stream()
                .collect(Collectors.groupingBy(ShiftCreditEntry::getShiftId));

        return shifts.stream()
                .map(shift -> {
                    List<Nozzle> nozzles = nozzleIdsByShiftId.getOrDefault(shift.getId(), List.of()).stream()
                            .map(nozzleById::get)
                            .filter(Objects::nonNull)
                            .toList();
                    User openedBy = userById.get(shift.getOpenedByUserId());
                    User investigatedBy = userById.get(shift.getInvestigationStartedById());
                    PumpShiftDefinition definition = definitionById.get(shift.getShiftDefinitionId());
                    return toResponse(shift, duById.get(shift.getDuId()), nozzles, userById.get(shift.getOperatorId()),
                            openedBy != null ? openedBy.getFullName() : null,
                            investigatedBy != null ? investigatedBy.getFullName() : null,
                            readingsByShiftId.getOrDefault(shift.getId(), List.of()),
                            entriesByShiftId.getOrDefault(shift.getId(), List.of()),
                            definition != null ? definition.scheduledEnd(shift.getShiftDate(), businessClock.zone()) : null);
                })
                .toList();
    }

    public ShiftResponse toResponse(Shift shift, DispensaryUnit du, List<Nozzle> nozzles,
                                    User operator, String openedByName,
                                    List<ShiftFuelReading> readings, List<ShiftCreditEntry> entries) {
        return toResponse(shift, du, nozzles, operator, openedByName, null, readings, entries, computeScheduledEndTime(shift));
    }

    private static <T> Map<Long, T> findAllByIdAsMap(JpaRepository<T, Long> repository, Set<Long> ids,
                                                     Function<T, Long> idOf) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return repository.findAllById(ids).stream().collect(Collectors.toMap(idOf, Function.identity()));
    }

    private ShiftResponse toResponse(Shift shift, DispensaryUnit du, List<Nozzle> nozzles,
                                     User operator, String openedByName, String investigatedByName,
                                     List<ShiftFuelReading> readings, List<ShiftCreditEntry> entries,
                                     OffsetDateTime scheduledEndTime) {

        List<ShiftResponse.NozzleSummary> nozzleSummaries = nozzles.stream()
                .sorted(Comparator.comparing(Nozzle::getNozzleNumber, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(n -> new ShiftResponse.NozzleSummary(n.getId(), n.getNozzleNumber(), n.getFuelType().name()))
                .toList();

        Map<Long, BigDecimal> maxMeterByNozzleId = nozzles.stream()
                .collect(Collectors.toMap(Nozzle::getId, Nozzle::getMaxMeterValue, (first, second) -> first));
        Map<Long, Integer> nozzleNumberById = nozzles.stream()
                .filter(n -> n.getNozzleNumber() != null)
                .collect(Collectors.toMap(Nozzle::getId, Nozzle::getNozzleNumber, (first, second) -> first));
        List<ShiftResponse.FuelReadingResponse> fuelReadingResponses = readings.stream()
                .sorted(Comparator.comparing((ShiftFuelReading r) -> nozzleNumberById.get(r.getNozzleId()),
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .map(r -> new ShiftResponse.FuelReadingResponse(
                        r.getNozzleId(),
                        r.getFuelType(),
                        r.getStartReading(),
                        r.getEndReading(),
                        r.getPriceSnapshot(),
                        r.getUnitsSold(),
                        maxMeterByNozzleId.get(r.getNozzleId())))
                .toList();

        List<ShiftResponse.CreditEntryResponse> creditEntryResponses = entries.stream()
                .map(entry -> new ShiftResponse.CreditEntryResponse(
                        entry.getId(),
                        entry.getClientId(),
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
                .scheduledEndTime(scheduledEndTime)
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
                .investigationNote(shift.getInvestigationNote())
                .investigatedByName(investigatedByName)
                .investigationStartedAt(shift.getInvestigationStartedAt())
                .cashRecoveryAmount(shift.getCashRecoveryAmount())
                .status(shift.getStatus().name())
                .isBackfilled(shift.isBackfilled())
                .creditEntries(creditEntryResponses)
                .build();
    }

    /**
     * Derives the shift's scheduled end time from its linked definition.
     * Returns null if no definition is linked (legacy data) or if the definition no longer exists.
     */
    public OffsetDateTime computeScheduledEndTime(Shift shift) {
        if (shift.getShiftDefinitionId() == null) return null;
        return shiftDefinitionRepository.findById(shift.getShiftDefinitionId())
                .map(def -> def.scheduledEnd(shift.getShiftDate(), businessClock.zone()))
                .orElse(null);
    }
}
