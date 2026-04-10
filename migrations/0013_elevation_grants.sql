-- Elevation grants: time-boxed permission elevation for agent sessions.
CREATE TABLE IF NOT EXISTS elevation_grants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_elevation_grants_session ON elevation_grants (session_id, revoked);
