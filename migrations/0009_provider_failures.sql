CREATE TABLE IF NOT EXISTS provider_failures (
  provider_id TEXT PRIMARY KEY,
  failed_at   TEXT NOT NULL,
  error       TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);
