package com.ppms.shift;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;

/**
 * Formal handover record between an outgoing and an incoming operator.
 * The outgoing shift is closed at handover time and a new shift is opened for the incoming operator.
 *
 * Captures whether physical cash and meter readings were verified at handover time.
 * The outgoing shift must be in OPEN status — handovers against already-closed shifts
 * are not meaningful and are rejected.
 */
@Entity
@Table(name = "shift_handovers")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShiftHandover {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    /** The shift the outgoing operator was running when the handover occurred. */
    @Column(name = "outgoing_shift_id", nullable = false)
    private Long outgoingShiftId;

    @Column(name = "outgoing_operator_id", nullable = false)
    private Long outgoingOperatorId;

    @Column(name = "incoming_operator_id", nullable = false)
    private Long incomingOperatorId;

    /** The shift opened for the incoming operator. Null on handovers recorded before shifts were split at handover. */
    @Column(name = "incoming_shift_id")
    private Long incomingShiftId;

    /** Whether the outgoing operator physically counted and handed over cash. */
    @Column(name = "physical_cash_verified", nullable = false)
    private boolean physicalCashVerified;

    /** Whether both operators agreed on the current meter reading at handover. */
    @Column(name = "meter_readings_verified", nullable = false)
    private boolean meterReadingsVerified;

    @Column(name = "notes")
    private String notes;

    @Column(name = "handover_time", nullable = false)
    private OffsetDateTime handoverTime;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
        if (handoverTime == null) {
            handoverTime = OffsetDateTime.now();
        }
    }
}
