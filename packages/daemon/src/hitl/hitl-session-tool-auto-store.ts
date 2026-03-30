import type Database from "better-sqlite3";

export function insertSessionToolAutoApprove(
  db: Database.Database,
  sessionId: string,
  toolName: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO hitl_session_tool_auto_approve (session_id, tool_name)
     VALUES (@session_id, @tool_name)`,
  ).run({ session_id: sessionId.trim(), tool_name: toolName.trim() });
}

export function sessionHasToolAutoApprove(
  db: Database.Database,
  sessionId: string,
  toolName: string,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM hitl_session_tool_auto_approve
       WHERE session_id = @sid AND tool_name = @tn LIMIT 1`,
    )
    .get({ sid: sessionId.trim(), tn: toolName.trim() }) as { ok: number } | undefined;
  return row !== undefined;
}

/** Removes all per-session tool auto-approve rows (e.g. after `session_context_new`). */
export function clearSessionToolAutoApproveForSession(db: Database.Database, sessionId: string): number {
  const r = db
    .prepare(`DELETE FROM hitl_session_tool_auto_approve WHERE session_id = @sid`)
    .run({ sid: sessionId.trim() });
  return Number(r.changes);
}
