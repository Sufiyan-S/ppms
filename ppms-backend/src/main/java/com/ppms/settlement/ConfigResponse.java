package com.ppms.settlement;

import lombok.Builder;
import lombok.Data;

@Data @Builder
public class ConfigResponse {
    private Long   id;
    private String paymentType;
    private String alertTime;   // HH:mm
    private boolean enabled;
}
