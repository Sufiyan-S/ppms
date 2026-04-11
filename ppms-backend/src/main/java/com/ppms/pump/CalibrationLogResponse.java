package com.ppms.pump;

import lombok.Builder;
import lombok.Value;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Value
@Builder
public class CalibrationLogResponse {
    Long id;
    Long pumpId;
    Long nozzleId;
    LocalDate calibrationDate;
    LocalDate nextCalibrationDue;
    String calibratedBy;
    String certificateReference;
    String notes;
    Long loggedByUserId;
    String loggedByName;
    OffsetDateTime createdAt;
}
