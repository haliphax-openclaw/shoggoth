// ---------------------------------------------------------------------------
// AGENTS.md discovery gate — blocks tool execution until agent reads instructions
// ---------------------------------------------------------------------------

import { readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type Database from "better-sqlite3";

export interface AgentsMdGateResult {
  readonly gated: true;
  readonly message: string;
  readonly files: readonly { path: string; content: string }[];
}

/**
 * Walk from `cwd` up to (but NOT including) `workspaceRoot`, checking each
 * directory for an `AGENTS.md` file.  Returns a gate result if any file is
 * new or modified since last seen for this session; otherwise returns null.
 *
 * After returning a gate result the discovered files are marked as seen.
 */
export function checkAgentsMdGate(
  db: Database.Database,
  sessionId: string,
  cwd: string,
  workspaceRoot: string,
): AgentsMdGateResult | null {
  // Collect directories from cwd up to (exclusive) workspaceRoot
  const dirs: string[] = [];
  let cur = cwd;
  while (cur !== workspaceRoot && cur.startsWith(workspaceRoot)) {
    dirs.push(cur);
    const parent = dirname(cur);
    if (parent === cur) break; // filesystem root
    cur = parent;
  }
  dirs.reverse(); // ancestor-first

  // Discover AGENTS.md files on disk first (no DB access yet)
  const found: { relPath: string; absPath: string; mtimeMs: number }[] = [];

  for (const dir of dirs) {
    const absPath = join(dir, "AGENTS.md");
    let st;
    try {
      st = statSync(absPath);
    } catch {
      continue;
    }
    found.push({ relPath: relative(workspaceRoot, absPath), absPath, mtimeMs: Math.floor(st.mtimeMs) });
  }

  if (found.length === 0) return null;

  // Check which files are new or modified
  const getStmt = db.prepare(
    "SELECT mtime_ms FROM agents_md_seen WHERE session_id = ? AND file_path = ?",
  );

  const unseen = found.filter((f) => {
    const row = getStmt.get(sessionId, f.absPath) as { mtime_ms: number } | undefined;
    return !row || row.mtime_ms !== f.mtimeMs;
  });

  if (unseen.length === 0) return null;

  // Read contents and mark as seen
  const upsert = db.prepare(
    "INSERT INTO agents_md_seen (session_id, file_path, mtime_ms) VALUES (?, ?, ?) ON CONFLICT(session_id, file_path) DO UPDATE SET mtime_ms = excluded.mtime_ms",
  );

  const files: { path: string; content: string }[] = [];
  for (const f of unseen) {
    const content = readFileSync(f.absPath, "utf8");
    files.push({ path: f.relPath, content });
    upsert.run(sessionId, f.absPath, f.mtimeMs);
  }

  return {
    gated: true,
    message:
      "AGENTS.md discovered — read the following project instructions before proceeding, then retry your tool call (or adjust it to follow conventions):",
    files,
  };
}
