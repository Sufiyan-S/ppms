-- V9: Data integrity constraints
--
-- 1. FK on active_nozzle_assignments.shift_id
--    The column existed without a FK since V8. If a shift row is ever hard-deleted
--    (admin fix, future admin endpoint), the nozzle lock remains forever, permanently
--    blocking that nozzle. ON DELETE CASCADE cleans up the lock automatically.
--
-- 2. UNIQUE on shift_handovers.outgoing_shift_id
--    Enforces the business rule "one handover per outgoing shift" at the DB level.
--    ShiftHandoverService already checks this in application code, but without a
--    DB constraint two concurrent requests could both pass the check and insert duplicate rows.
--    This acts as the final safety net (same pattern as active_nozzle_assignments PK in V8).

ALTER TABLE active_nozzle_assignments
    ADD CONSTRAINT fk_ana_shift
        FOREIGN KEY (shift_id) REFERENCES shifts (id) ON DELETE CASCADE;

CREATE UNIQUE INDEX uq_sho_outgoing_shift ON shift_handovers (outgoing_shift_id);
