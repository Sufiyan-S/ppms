package com.ppms.pump;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;

@Data
@Builder
public class PumpResponse {

    private Long id;
    private String name;
    private String address;
    private Integer maxNozzleCount;
    private Long ownerId;
    private OffsetDateTime createdAt;
    private List<NozzleResponse> nozzles;
}
