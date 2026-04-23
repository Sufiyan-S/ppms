package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Statement;

/**
 * Adds CLOSED_DISCREPANCY_PENDING_APPROVAL to the shift_status PostgreSQL enum.
 *
 * This must run outside a transaction because PostgreSQL does not allow
 * ALTER TYPE ... ADD VALUE inside an explicit transaction block.
 * canExecuteInTransaction() = false tells Flyway to skip the BEGIN/COMMIT wrapper.
 */
public class V9__add_discrepancy_approval_status extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        try (Statement stmt = context.getConnection().createStatement()) {
            stmt.execute(
                "ALTER TYPE shift_status ADD VALUE IF NOT EXISTS " +
                "'CLOSED_DISCREPANCY_PENDING_APPROVAL' AFTER 'CLOSED_DISCREPANCY_PENDING'"
            );
        }
    }

    @Override
    public boolean canExecuteInTransaction() {
        return false;
    }
}
