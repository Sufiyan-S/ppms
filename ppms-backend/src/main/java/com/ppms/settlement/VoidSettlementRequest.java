package com.ppms.settlement;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class VoidSettlementRequest {
    @NotBlank(message = "A reason is required to void a settlement.")
    private String reason;
}
