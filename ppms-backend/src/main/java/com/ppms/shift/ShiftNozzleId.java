package com.ppms.shift;

import java.io.Serializable;
import java.util.Objects;

/**
 * Composite primary key for the shift_nozzles join table.
 * Required by JPA when using @IdClass on a multi-column PK entity.
 */
public class ShiftNozzleId implements Serializable {

    private Long shiftId;
    private Long nozzleId;

    public ShiftNozzleId() {}

    public ShiftNozzleId(Long shiftId, Long nozzleId) {
        this.shiftId = shiftId;
        this.nozzleId = nozzleId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ShiftNozzleId that)) return false;
        return Objects.equals(shiftId, that.shiftId) && Objects.equals(nozzleId, that.nozzleId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(shiftId, nozzleId);
    }
}
