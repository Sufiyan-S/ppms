package com.ppms.shift;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "active_nozzle_assignments")
@Getter
@NoArgsConstructor
public class ActiveNozzleAssignment {

    @Id
    @Column(name = "nozzle_id")
    private Long nozzleId;

    @Column(name = "shift_id", nullable = false)
    private Long shiftId;
}
