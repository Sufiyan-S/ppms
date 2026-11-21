package com.ppms.payroll;

import com.ppms.shift.ShiftStatus;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "payroll_resolved_shifts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PayrollResolvedShift {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "payroll_id", nullable = false)
    private Long payrollId;

    @Column(name = "shift_id", nullable = false)
    private Long shiftId;

    @Enumerated(EnumType.STRING)
    @Column(name = "previous_status", nullable = false)
    private ShiftStatus previousStatus;
}
