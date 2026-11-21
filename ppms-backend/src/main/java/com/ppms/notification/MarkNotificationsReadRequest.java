package com.ppms.notification;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class MarkNotificationsReadRequest {
    @NotNull
    @Size(max = 100)
    private List<Long> ids;
}
