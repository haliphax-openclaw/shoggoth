import type Database from "better-sqlite3";

interface ProviderFailure {
  readonly failedAt: Date;
  readonly error?: string;
  readonly retryCount: number;
}

interface ProviderFailureRow {
  provider_id: string;
  failed_at: string;
  error: string | null;
  retry_count: number;
}

/** Upsert a provider failure. Increments retry_count on conflict. */
export function markProviderFailed(
  db: Database.Database,
  providerId: string,
  error?: string,
): void {
  db.prepare(
    `INSERT INTO provider_failures (provider_id, failed_at, error, retry_count)
     VALUES (@providerId, datetime('now'), @error, 1)
     ON CONFLICT(provider_id) DO UPDATE SET
       failed_at = datetime('now'),
       error = @error,
       retry_count = retry_count + 1`,
  ).run({ providerId, error: error ?? null });
}

/** Delete a provider's failure record. */
export function clearProviderFailure(
  db: Database.Database,
  providerId: string,
): void {
  db.prepare(
    "DELETE FROM provider_failures WHERE provider_id = @providerId",
  ).run({ providerId });
}

/** Get a provider's failure record, or null if none exists. */
export function getProviderFailure(
  db: Database.Database,
  providerId: string,
): ProviderFailure | null {
  const row = db
    .prepare(
      `SELECT provider_id, failed_at, error, retry_count
       FROM provider_failures WHERE provider_id = @providerId`,
    )
    .get({ providerId }) as ProviderFailureRow | undefined;
  if (!row) return null;
  return {
    failedAt: new Date(row.failed_at + "Z"),
    error: row.error ?? undefined,
    retryCount: row.retry_count,
  };
}

/**
 * Returns true if the provider is marked failed and the failure is not stale.
 * A failure is stale when `now - failedAt >= markFailedDurationMs`.
 * Stale failures are automatically cleared.
 */
export function isProviderFailed(
  db: Database.Database,
  providerId: string,
  markFailedDurationMs: number,
): boolean {
  const failure = getProviderFailure(db, providerId);
  if (!failure) return false;

  const elapsed = Date.now() - failure.failedAt.getTime();
  if (elapsed >= markFailedDurationMs) {
    clearProviderFailure(db, providerId);
    return false;
  }
  return true;
}
