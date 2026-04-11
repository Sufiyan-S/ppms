package com.ppms.pump;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Calibration record for a nozzle.
 * When next_calibration_due is set and that date has passed, the notification system
 * fires a CALIBRATION_DUE alert. ShiftService.openShift() blocks the shift if the
 * nozzle's calibration is overdue by more than a tolerance period.
 *
 * calibrated_by: name of the external calibration agency or technician.
 * certificate_reference: inspection certificate number for compliance records.
 */
@Entity
@Table(name = "nozzle_calibration_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NozzleCalibrationLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "nozzle_id", nullable = false)
    private Long nozzleId;

    @Column(name = "calibration_date", nullable = false)
    private LocalDate calibrationDate;

    /**
     * The date by which the next calibration must be completed.
     * Null means no follow-up is scheduled (one-off calibration with no expiry set).
     */
    @Column(name = "next_calibration_due")
    private LocalDate nextCalibrationDue;

    @Column(name = "calibrated_by", length = 150)
    private String calibratedBy;

    @Column(name = "certificate_reference", length = 100)
    private String certificateReference;

    @Column(name = "notes")
    private String notes;

    @Column(name = "logged_by_user_id", nullable = false)
    private Long loggedByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
