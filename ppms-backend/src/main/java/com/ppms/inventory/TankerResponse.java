package com.ppms.inventory;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Data
@Builder
public class TankerResponse {
    private Long id;
    private Long pumpId;
    private String name;
    private BigDecimal capacityLitres;
    private String tankerType;
    /** JSON key is "defaultTanker" — avoids Lombok/Jackson boolean-getter name collision with "default". */
    private boolean defaultTanker;
    private boolean active;
    private OffsetDateTime createdAt;
}
