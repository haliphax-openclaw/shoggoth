-- Rename handled by repairSessionsSubagentColumnsIfNeeded() backfill for
-- DBs that may not have the old column yet. This migration is intentionally
-- a no-op; the backfill covers all cases idempotently.
SELECT 1;
