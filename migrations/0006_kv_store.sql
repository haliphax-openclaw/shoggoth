-- Phase 4: structured key-value store scoped by workspace.
CREATE TABLE IF NOT EXISTS kv_store (
  workspace  TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace, key)
);
