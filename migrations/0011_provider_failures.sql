-- Phase 1: Provider Failures Tracking
-- Tracks provider failure state for failover decision-making

CREATE TABLE IF NOT EXISTS provider_failures (
  provider_id TEXT NOT NULL,
  failed_at   TEXT NOT NULL,
  error       TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_failures_failed_at ON provider_failures(failed_at);
