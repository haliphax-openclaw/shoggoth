-- Phase 5: deferred timer actions.
CREATE TABLE IF NOT EXISTS timers (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  label       TEXT NOT NULL,
  fire_at     TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  fired       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_timers_fire ON timers (fired, fire_at);
