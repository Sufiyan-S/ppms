package com.ppms.superadmin;

import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class OwnerSummaryAssembler {

    private final PumpLocationRepository pumpLocationRepository;
    private final UserRepository userRepository;

    public OwnerSummaryResponse buildOwnerSummary(User owner) {
        List<PumpLocation> pumps = pumpLocationRepository.findByOwnerId(owner.getId());
        return buildOwnerSummary(owner, pumps, buildStaffCountMap(pumps.stream().map(PumpLocation::getId).toList()));
    }

    public List<OwnerSummaryResponse> buildOwnerSummaries(List<User> owners) {
        List<Long> ownerIds = owners.stream().map(User::getId).toList();
        Map<Long, List<PumpLocation>> pumpsByOwner = pumpLocationRepository.findByOwnerIdIn(ownerIds).stream()
                .collect(Collectors.groupingBy(PumpLocation::getOwnerId));

        List<Long> allPumpIds = pumpsByOwner.values().stream()
                .flatMap(List::stream)
                .map(PumpLocation::getId)
                .toList();
        Map<Long, Long> staffCounts = allPumpIds.isEmpty() ? Map.of() : buildStaffCountMap(allPumpIds);

        return owners.stream()
                .map(owner -> buildOwnerSummary(owner, pumpsByOwner.getOrDefault(owner.getId(), List.of()), staffCounts))
                .toList();
    }

    private OwnerSummaryResponse buildOwnerSummary(User owner, List<PumpLocation> pumps, Map<Long, Long> staffCounts) {
        List<OwnerSummaryResponse.PumpSummary> pumpSummaries = pumps.stream()
                .map(pump -> OwnerSummaryResponse.PumpSummary.builder()
                        .pumpId(pump.getId())
                        .pumpName(pump.getName())
                        .pumpAddress(pump.getAddress())
                        .enabled(pump.isEnabled())
                        .staffCount(staffCounts.getOrDefault(pump.getId(), 0L))
                        .build())
                .toList();

        return OwnerSummaryResponse.builder()
                .ownerId(owner.getId())
                .employeeId(owner.getEmployeeId())
                .fullName(owner.getFullName())
                .phoneNumber(owner.getPhoneNumber())
                .status(owner.getStatus().name())
                .createdAt(owner.getCreatedAt())
                .pumps(pumpSummaries)
                .build();
    }

    private Map<Long, Long> buildStaffCountMap(List<Long> pumpIds) {
        if (pumpIds.isEmpty()) {
            return Map.of();
        }
        return userRepository.countStaffByPumpIds(pumpIds).stream()
                .collect(Collectors.toMap(
                        row -> (Long) row[0],
                        row -> (Long) row[1]
                ));
    }
}
