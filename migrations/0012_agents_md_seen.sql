CREATE TABLE IF NOT EXISTS agents_md_seen (
  session_id TEXT NOT NULL,
  file_path  TEXT NOT NULL,
  mtime_ms   INTEGER NOT NULL,
  PRIMARY KEY (session_id, file_path)
);
