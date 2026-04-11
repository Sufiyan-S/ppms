package com.ppms.pump;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;

/**
 * Defines a named shift window for a specific pump, configured by an admin/owner.
 *
 * Each pump can have up to 4 active definitions per effective-date group.
 * At least one definition must have isNightShift=true and must overlap 00:00–06:00.
 *
 * crossesMidnight is derived at creation time: true when endTime < startTime
 * (e.g. start=22:00, end=10:00 spans midnight).
 *
 * When an admin changes the shift schedule, a new set of definitions is created
 * with a new effectiveFrom date. The old definitions get their effectiveTo set,
 * preserving the FK link from historical Shift records.
 */
@Entity
@Table(name = "pump_shift_definitions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PumpShiftDefinition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    /** Human-readable name set by the admin, e.g. "Night Shift", "Morning Shift". */
    @Column(name = "name", nullable = false, length = 100)
    private String name;

    /** 24-hour start time, e.g. 22:00. */
    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    /**
     * 24-hour end time, e.g. 10:00.
     * If endTime < startTime, crossesMidnight must be true.
     */
    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    /**
     * True when this shift spans midnight (endTime < startTime).
     * Derived automatically by the service before saving.
     */
    @Column(name = "crosses_midnight", nullable = false)
    private boolean crossesMidnight;

    /**
     * True when this is the designated night shift.
     * The time range must overlap 00:00–06:00 (validated by service).
     * Exactly one definition per effective-date group must have this set to true.
     */
    @Column(name = "is_night_shift", nullable = false)
    private boolean isNightShift;

    /** Display order (1-based). Used for UI rendering and slot-index calculations in planning. */
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    /**
     * The date from which this definition is active.
     * Shifts opened on or after this date will be matched against this definition
     * (provided effectiveTo is null or in the future).
     */
    @Column(name = "effective_from", nullable = false)
    private LocalDate effectiveFrom;

    /**
     * The last date on which this definition is active (inclusive).
     * Null means it is currently active with no planned end.
     * Set by the service when a new set of definitions supersedes this one.
     */
    @Column(name = "effective_to")
    private LocalDate effectiveTo;

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
        updatedAt = OffsetDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    /**
     * Returns true if the given time falls within this shift's window.
     *
     * For cross-midnight shifts (e.g. 22:00–10:00):
     *   time >= startTime  OR  time < endTime
     * For same-day shifts (e.g. 06:00–14:00):
     *   startTime <= time < endTime
     */
    public boolean containsTime(LocalTime time) {
        if (crossesMidnight) {
            return !time.isBefore(startTime) || time.isBefore(endTime);
        }
        return !time.isBefore(startTime) && time.isBefore(endTime);
    }

    /**
     * Returns the duration of this shift in minutes.
     * Cross-midnight shifts are treated as (24h - start + end).
     */
    public long durationMinutes() {
        if (crossesMidnight) {
            return (24 * 60L - startTime.toSecondOfDay() / 60) + endTime.toSecondOfDay() / 60;
        }
        return (endTime.toSecondOfDay() - startTime.toSecondOfDay()) / 60L;
    }
}
