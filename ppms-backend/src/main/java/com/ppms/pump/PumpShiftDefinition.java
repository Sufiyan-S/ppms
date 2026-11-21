package com.ppms.pump;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;

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

    /** Stored end times are one minute before the displayed end, so the real boundary is endTime + 1 minute. */
    public LocalTime exclusiveEndTime() {
        return endTime.plusMinutes(1);
    }

    public boolean containsTime(LocalTime time) {
        if (crossesMidnight) {
            return !time.isBefore(startTime) || isInAfterMidnightPart(time);
        }
        LocalTime end = exclusiveEndTime();
        boolean endsAtMidnight = end.equals(LocalTime.MIDNIGHT);
        return !time.isBefore(startTime) && (endsAtMidnight || time.isBefore(end));
    }

    /** True for the part of a cross-midnight shift that falls on the day after its shift date. */
    public boolean isInAfterMidnightPart(LocalTime time) {
        return crossesMidnight && time.isBefore(exclusiveEndTime());
    }

    public OffsetDateTime scheduledEnd(LocalDate shiftDate, ZoneId zone) {
        LocalDate endDate = crossesMidnight ? shiftDate.plusDays(1) : shiftDate;
        return LocalDateTime.of(endDate, endTime).plusMinutes(1).atZone(zone).toOffsetDateTime();
    }
}
