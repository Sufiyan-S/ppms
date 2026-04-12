package com.ppms.shift;

import jakarta.persistence.*;
import lombok.*;

/**
 * Join table: maps which nozzles from a Dispensary Unit are active in a shift.
 *
 * One shift → 1..N nozzles (all from the same DU).
 * A nozzle may appear in at most one open shift at a time — enforced at
 * application level in ShiftService.openShift() via ShiftRepository.findOpenShiftByNozzle().
 */
@Entity
@Table(name = "shift_nozzles")
@IdClass(ShiftNozzleId.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShiftNozzle {

    @Id
    @Column(name = "shift_id", nullable = false)
    private Long shiftId;

    @Id
    @Column(name = "nozzle_id", nullable = false)
    private Long nozzleId;
}
