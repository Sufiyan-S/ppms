package com.ppms.settlement;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.NotNull;
import java.time.LocalTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class UpdateConfigRequest {
    @NotNull(message = "alertTime is required (HH:mm).")
    @JsonFormat(pattern = "HH:mm")
    private LocalTime alertTime;
    private boolean enabled;
}
